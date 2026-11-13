/**
 * SSE (EventSource) wrapper.
 *
 * - OmniMessage uses the default event (no `event:` line); data is the message envelope as
 *   raw JSON;
 * - Server events use `event: server_event` (approval_request / task_state / resync_required /
 *   credentials_updated / hello);
 * - EventSource can't set custom request headers, so auth relies on same-origin cookies; on
 *   disconnect, the browser auto-reconnects and attaches a `Last-Event-ID` header (the server
 *   replays from its ring buffer; if the event was already evicted, it pushes resync_required
 *   instead).
 * - Liveness: a connection can die without any error (half-open TCP, a stuck proxy or NAT, a
 *   middlebox that completes the handshake and then swallows the body). Two watches, because two
 *   failures look different from here: a connection that delivers nothing at all within
 *   {@link FIRST_FRAME_MS} is dead on arrival — the current server answers a subscribe with its
 *   task_state snapshot, so silence that long means the answer never got through, and the same
 *   watch covers servers of any age (an old one with no heartbeat included); once the stream has
 *   spoken, {@link SILENCE_MS} without any event closes it and opens a new one with
 *   `?lastEventId=` set to the last id seen, though only for a stream that has pinged (the
 *   server's heartbeat, every 20 s) — silence from a server that never pings is its normal state,
 *   not a symptom. Reopening is immediate, and once {@link MAX_STALLED} connections in a row have
 *   died on arrival the stream is judged STALLED: the channel is not coming back on its own, so
 *   instead of reopening every {@link FIRST_FRAME_MS} forever it is probed once a minute and the
 *   caller is told, through {@link StreamHandlers.onLiveness}, to keep itself current another way.
 *   Any event that gets through clears that verdict at once. The tab becoming visible checks
 *   immediately, since background timers run late; a connection the browser gave up on is left as
 *   it is.
 * - Every frame received goes to api/sse-frames.ts, which records nothing until the reader turns
 *   the Trace panel's Transport view on.
 * Docs: /docs/server-api § "Streaming (SSE)".
 */
import type { OmniMessage } from "@adelie/core/omnimessage";
import type { ServerEvent } from "@adelie/server/api";
import { apiUrl } from "../lib/server-context";
import { machineForSession } from "../lib/session-machines";
import { lifecycleEntry, noteSseFrame, receivedEntry } from "./sse-frames";
import type { SseChannel } from "./sse-frames";

/** The server pings every 20 s: this much silence means the connection is gone. */
const SILENCE_MS = 50_000;
/** A connection that has delivered nothing at all in this long never really connected. */
const FIRST_FRAME_MS = 30_000;
/** This many connections in a row with nothing on them: the stream is stalled, not flaky. */
const MAX_STALLED = 3;
/** While stalled, how often one fresh connection is tried. */
const STALL_REPROBE_MS = 60_000;

export interface StreamHandlers {
  /**
   * A single OmniMessage (full/streaming/event, envelope as-is). `eventId` is the SSE
   * event id assigned by the server channel (`<epoch>-<seq>`; null if the event carried
   * none) — stream-controller uses it to align buffered events with the live-tail cursor
   * that GET /messages returns.
   */
  onOmniMessage: (msg: OmniMessage, eventId: string | null) => void;
  /** A single server event (`eventId`: same as onOmniMessage). */
  onServerEvent: (event: ServerEvent, eventId: string | null) => void;
  /** Connection established (including a successful auto-reconnect, and a reopen after silence). */
  onOpen?: () => void;
  /**
   * Connection error. `closed` is true when the browser has deemed the connection fatally
   * broken and closed it (e.g. the handshake returned 401/403, so it won't auto-reconnect);
   * when false, the browser will auto-reconnect and no manual handling is needed.
   */
  onError?: (closed: boolean) => void;
  /**
   * The stream's liveness verdict, on every change: "stalled" once several connections in a row
   * have delivered nothing (the transport is eating the stream, so nothing this page shows will
   * ever move on its own), "live" again the moment an event gets through — whether that is the
   * next probe or the browser's own reconnect. A consumer that shows live state should refresh
   * itself on a timer while stalled.
   */
  onLiveness?: (state: "live" | "stalled") => void;
}

export interface StreamConnection {
  close: () => void;
}

function subscribe(
  url: string,
  channel: SseChannel,
  sessionId: string | null,
  handlers: StreamHandlers,
): StreamConnection {
  let source: EventSource | undefined;
  /** The newest event id seen on any of this subscription's connections. */
  let lastEventId = "";
  let lastHeard = 0;
  /** The stream has pinged, so silence means a dead connection. */
  let armed = false;
  /** The current connection has delivered at least one event. */
  let gotFrame = false;
  /** When the current connection was opened. */
  let openedAt = 0;
  /** Connections in a row that opened and then delivered nothing. */
  let silentOpens = 0;
  /** The stream is not coming back on its own: probed once a minute instead of reopened at once. */
  let stalled = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let probe: ReturnType<typeof setTimeout> | undefined;

  const heard = (e: MessageEvent<string>) => {
    lastHeard = Date.now();
    gotFrame = true;
    if (e.lastEventId) lastEventId = e.lastEventId;
    if (stalled || silentOpens !== 0) {
      stalled = false;
      silentOpens = 0;
      noteSseFrame(lifecycleEntry(channel, sessionId, "live"));
      handlers.onLiveness?.("live");
    }
    // The frame moves the deadline: the first one retires the dead-on-arrival watch entirely
    // (a stream that never pings has no silence window — see the module comment), a later one
    // puts the silence window back at this moment.
    watch();
  };
  /** One frame off the wire: counted as heard, and handed to the recorder. */
  const received = (event: string, e: MessageEvent<string>) => {
    heard(e);
    noteSseFrame(receivedEntry(channel, sessionId, event, e.lastEventId || null, e.data));
  };
  const onMessage = (e: MessageEvent<string>) => {
    received("message", e);
    try {
      // Every server event carries an `id:` line; lastEventId is "" only if none did.
      handlers.onOmniMessage(JSON.parse(e.data) as OmniMessage, e.lastEventId || null);
    } catch {
      // Ignore lines that fail to parse (the protocol guarantees single-line JSON data, so this shouldn't normally happen).
    }
  };
  const onServerEvent = (e: MessageEvent<string>) => {
    received("server_event", e);
    try {
      handlers.onServerEvent(JSON.parse(e.data) as ServerEvent, e.lastEventId || null);
    } catch {
      // Same as above.
    }
  };
  const onPing = (e: MessageEvent<string>) => {
    received("ping", e);
    armed = true;
    check();
  };
  const onError = () => {
    const closed = source?.readyState === EventSource.CLOSED;
    noteSseFrame(lifecycleEntry(channel, sessionId, closed ? "closed" : "error"));
    // The browser gave up on the connection: what happens next is the caller's call, as before —
    // except while the stream is stalled, where the probe is the only thing still trying and the
    // browser retries nothing: a probe that dies like this schedules the next one.
    if (closed) disarm();
    if (closed && stalled) scheduleProbe();
    handlers.onError?.(closed);
  };
  const connect = () => {
    clearTimeout(watchdog);
    clearTimeout(probe);
    source?.close();
    openedAt = Date.now();
    gotFrame = false;
    source = new EventSource(
      lastEventId ? `${url}?lastEventId=${encodeURIComponent(lastEventId)}` : url,
    );
    source.onmessage = onMessage;
    source.addEventListener("server_event", onServerEvent);
    source.addEventListener("ping", onPing);
    source.onopen = () => {
      noteSseFrame(lifecycleEntry(channel, sessionId, "open"));
      handlers.onOpen?.();
    };
    source.onerror = onError;
    watch();
  };

  /** When the current connection should be judged dead (`0`: nothing worth watching yet). */
  const dueAt = (): number => {
    if (!gotFrame) return openedAt + FIRST_FRAME_MS;
    if (armed) return lastHeard + SILENCE_MS;
    return 0;
  };
  /** Arms the watchdog for that deadline; the timer runs late in a background tab, hence check(). */
  const watch = () => {
    clearTimeout(watchdog);
    const due = dueAt();
    if (due !== 0) watchdog = setTimeout(fire, Math.max(0, due - Date.now()));
  };
  /** The deadline is up: this connection is dead — silent from the start, or silent past the window. */
  const fire = () => {
    clearTimeout(watchdog);
    if (!gotFrame) {
      silentOpens += 1;
      if (silentOpens >= MAX_STALLED) return stall();
    } else {
      noteSseFrame(lifecycleEntry(channel, sessionId, "reopen"));
    }
    connect();
  };
  /** One fresh connection after the probe interval, recorded as a probe (`connect` clears the timer). */
  const scheduleProbe = () => {
    clearTimeout(probe);
    probe = setTimeout(() => {
      noteSseFrame(lifecycleEntry(channel, sessionId, "probe"));
      connect();
    }, STALL_REPROBE_MS);
  };
  /** Nothing is coming through: stop reopening at once, probe once a minute, and say so. */
  const stall = () => {
    clearTimeout(watchdog);
    source?.close();
    if (!stalled) {
      stalled = true;
      noteSseFrame(lifecycleEntry(channel, sessionId, "stalled"));
      handlers.onLiveness?.("stalled");
    }
    scheduleProbe();
  };
  /** Reopens immediately if the deadline has already passed (a late timer, or a tab just shown). */
  const check = () => {
    if (stalled) return; // the probe timer owns the cadence
    const due = dueAt();
    if (due !== 0 && Date.now() >= due) return fire();
    watch();
  };
  const disarm = () => {
    armed = false;
    clearTimeout(watchdog);
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") check();
  };

  document.addEventListener("visibilitychange", onVisibility);
  connect();
  return {
    close: () => {
      disarm();
      clearTimeout(probe);
      document.removeEventListener("visibilitychange", onVisibility);
      source?.close();
    },
  };
}

/** Subscribes to a Session's output stream (GET /api/sessions/:sessionId/stream). */
export function openSessionStream(sessionId: string, handlers: StreamHandlers): StreamConnection {
  // Routed like every other Session call: the stream comes from the machine running it.
  const path = `/api/sessions/${encodeURIComponent(sessionId)}/stream`;
  return subscribe(apiUrl(path, machineForSession(sessionId)), "session", sessionId, handlers);
}

/**
 * Subscribes to the user-level server event stream (GET /api/events) — this server's, or a
 * machine's through the same-origin proxy. A Session on a machine changes state on THAT
 * machine's server, and only its stream says so; the list is assembled from every connected
 * machine, so its liveness has to be too.
 */
export function openUserEvents(
  handlers: StreamHandlers,
  machineId: string | null = null,
): StreamConnection {
  return subscribe(apiUrl("/api/events", machineId), "events", null, handlers);
}
