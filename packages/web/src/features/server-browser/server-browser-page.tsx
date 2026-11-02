/**
 * The server browser: a browser running on the machine that serves this window, its picture
 * streamed into this page.
 *
 * Why it exists: the built-in browser is the desktop app's — its pages ARE `<webview>` elements of
 * that window, so a server reached from anywhere else has no browser at all. This page is for
 * exactly those deployments: a Linux box with no display, driven over the network.
 *
 * How the picture arrives: an `<img>` pointed at the server's MJPEG stream. `multipart/x-mixed-
 * replace` is what an image element renders natively, so there is no canvas, no decoder and no
 * socket here — the browser on the server rasterizes, and this page shows the result. Frames are
 * dropped rather than queued server-side when this page falls behind.
 *
 * What the page adds on top: the address and the title, which the picture cannot carry. Those are
 * read from the status route on a slow poll rather than pushed with the pixels — the stream is one
 * long response, and something has to come beside it.
 *
 * Input goes the other way, one batch per request: a click is a press and a release, a drag or a
 * scroll is coalesced over a few tens of milliseconds so a pointer moving at 60Hz is not 60
 * requests. Coordinates are the PAGE's, converted here from where the pointer is in the picture —
 * the picture is scaled to the box, and the box is the page's own size (the page is redrawn at
 * whatever the box measures, so a window here is a viewport there).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ServerBrowserInput,
  ServerBrowserState,
  ServerBrowserStatus,
} from "@adelie/server/api";
import {
  Button,
  GlyphIcon,
  ICONS,
  ICON_SIZE,
  Input,
  PageFrame,
  PageHeader,
  Skeleton,
} from "@adelie/ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { useDocumentTitle } from "../../lib/use-document-title";
import { pointerToPagePoint } from "./frame-geometry";

/** How often the page re-reads what the browser is doing (the picture comes over its own stream). */
const POLL_MS = 1200;
/** A burst of input — a drag, a fast scroll — goes out as one request this often. */
const INPUT_FLUSH_MS = 40;
/** How long the box has to hold still before the page is redrawn at its size. */
const RESIZE_DEBOUNCE_MS = 350;
/** The page's own default, matching the server's: what the box is drawn at before it measures. */
const FALLBACK_VIEWPORT = { width: 1280, height: 800 };

/** The state the page shows while the browser has not answered yet. */
const INITIAL_STATE: ServerBrowserState = {
  url: "",
  title: "",
  loading: false,
  ...FALLBACK_VIEWPORT,
};

export function ServerBrowserPage() {
  useDocumentTitle(S.serverBrowser.pageTitle);
  const [status, setStatus] = useState<ServerBrowserStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * How far the picture has got: `none` before a single frame has arrived, `live` while they are
   * coming, `ended` when a stream that had been running stopped. The difference matters — the
   * first and last look nothing alike to somebody who is watching.
   */
  const [stream, setStream] = useState<"none" | "live" | "ended">("none");
  /** Bumped to point the `<img>` at the stream again: the one way to reconnect a broken one. */
  const [streamGeneration, setStreamGeneration] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const outbox = useRef<ServerBrowserInput[]>([]);
  const flushing = useRef(false);

  const state = status?.state ?? INITIAL_STATE;
  const available = status?.available ?? null;

  /** Reads the status once; a failure to read it is shown, not thrown. */
  const read = useCallback(async () => {
    try {
      setStatus(await api.getServerBrowserStatus());
      setFailure(null);
    } catch (err) {
      setFailure(apiErrorText(err));
    }
  }, []);

  useEffect(() => {
    void read();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [read]);

  /** One write to the browser, with the busy flag and the failure shown where it lands. */
  const act = useCallback(async (work: () => Promise<ServerBrowserStatus>) => {
    setBusy(true);
    try {
      setStatus(await work());
      setFailure(null);
    } catch (err) {
      // A refusal here is about the browser, which is exactly where the page already shows
      // trouble; a toast would say the same thing twice.
      setFailure(apiErrorText(err));
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Input, coalesced: everything queued inside one window goes out together, in order. The queue
   * is the reason a drag does not become one request per pointer event.
   */
  const send = useCallback((event: ServerBrowserInput) => {
    outbox.current.push(event);
    if (flushing.current) return;
    flushing.current = true;
    setTimeout(() => {
      const batch = outbox.current;
      outbox.current = [];
      flushing.current = false;
      if (batch.length === 0) return;
      void api.sendServerBrowserInput(batch).then(setStatus, () => {
        // Input that did not land means the browser is gone; the poll says so within a second, and
        // the next frame never comes. Nothing to add here.
      });
    }, INPUT_FLUSH_MS);
  }, []);

  const unreadable = failure !== null && status === null;
  const go = (url: string): void => {
    setDraft(null);
    void act(() => api.navigateServerBrowser(url));
  };

  return (
    <PageFrame width="full" contentClassName="flex flex-col gap-3">
      <PageHeader title={S.serverBrowser.pageTitle} description={S.serverBrowser.intro} />
      <Toolbar
        address={draft ?? state.url}
        busy={busy}
        disabled={available !== true}
        loading={state.loading}
        onAddress={(value) => setDraft(value)}
        onGo={go}
        onBack={() => void act(api.serverBrowserBack)}
        onForward={() => void act(api.serverBrowserForward)}
        onReload={() => void act(() => api.reloadServerBrowser(false))}
        onStart={() =>
          void act(status?.running === true ? api.stopServerBrowser : api.startServerBrowser)
        }
        running={status?.running === true}
      />
      {available === false && <Unavailable reason={status?.reason ?? null} />}
      {failure !== null && status !== null && <Notice text={failure} />}
      {available === true && (
        <>
          <div className="flex min-h-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="truncate">{state.title === "" ? state.url : state.title}</span>
            <span className="shrink-0">{state.loading ? S.serverBrowser.loading : ""}</span>
            <span className="ml-auto shrink-0">
              {state.width}×{state.height}
            </span>
          </div>
          <Frame
            streamKey={streamGeneration}
            stream={stream}
            address={state.url}
            onStream={(next) =>
              setStream((was) => (next === "ended" && was !== "live" ? "none" : next))
            }
            onReconnect={() => {
              setStream("none");
              setStreamGeneration((n) => n + 1);
            }}
            send={send}
            onStatus={setStatus}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">{S.serverBrowser.hint}</p>
        </>
      )}
      {available === null && <Skeleton className="h-64 w-full" />}
    </PageFrame>
  );
}

/** The address bar and the five things a browser's toolbar does. */
function Toolbar({
  address,
  busy,
  disabled,
  loading,
  running,
  onAddress,
  onGo,
  onBack,
  onForward,
  onReload,
  onStart,
}: {
  address: string;
  busy: boolean;
  disabled: boolean;
  loading: boolean;
  running: boolean;
  onAddress: (value: string) => void;
  onGo: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStart: () => void;
}) {
  const icon = (d: string, label: string, onClick: () => void) => (
    <Button size="sm" variant="ghost" aria-label={label} title={label} onClick={onClick}>
      <GlyphIcon d={d} size={ICON_SIZE.rowLead} />
    </Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      {icon(ICONS.arrowLeft, S.serverBrowser.back, onBack)}
      {icon(ICONS.arrowRightCentered, S.serverBrowser.forward, onForward)}
      {icon(loading ? ICONS.xCircle : ICONS.refresh, S.serverBrowser.reload, onReload)}
      <form
        className="min-w-64 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (address.trim() !== "") onGo(address.trim());
        }}
      >
        <Input
          aria-label={S.serverBrowser.address}
          placeholder={S.serverBrowser.addressPlaceholder}
          value={address}
          disabled={disabled}
          onChange={(event) => onAddress(event.target.value)}
        />
      </form>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onGo(address.trim())}
        disabled={disabled}
      >
        {S.serverBrowser.go}
      </Button>
      <Button size="sm" variant="ghost" onClick={onStart} disabled={busy}>
        {running ? S.serverBrowser.stop : busy ? S.serverBrowser.starting : S.serverBrowser.start}
      </Button>
    </div>
  );
}

/** Wheels, clicks and keys, over the picture: everything the page is asked to do. */
function Frame({
  streamKey,
  stream,
  address,
  send,
  onStream,
  onReconnect,
  onStatus,
}: {
  streamKey: number;
  stream: "none" | "live" | "ended";
  address: string;
  send: (event: ServerBrowserInput) => void;
  onStream: (next: "live" | "ended") => void;
  onReconnect: () => void;
  onStatus: (status: ServerBrowserStatus) => void;
}) {
  const image = useRef<HTMLImageElement | null>(null);
  const surface = useRef<HTMLDivElement | null>(null);
  /**
   * The invisible editable element over the picture. An input method has nowhere to compose
   * without one: Chinese (and anything else that is composed before it is committed) would never
   * reach the page, because what travels on the keyboard path is a key, not a composed string.
   */
  const field = useRef<HTMLTextAreaElement | null>(null);
  /** The size the page is currently drawn at, so a resize of the same size is not sent twice. */
  const drawnAt = useRef("");

  /**
   * Where a pointer is, in the page's own coordinates: the picture is drawn scaled to fit the
   * box, so the element's rectangle is measured rather than assumed (see frame-geometry.ts).
   */
  const point = useCallback((clientX: number, clientY: number) => {
    const img = image.current;
    if (img === null) return null;
    return pointerToPagePoint(
      { width: img.naturalWidth, height: img.naturalHeight },
      img.getBoundingClientRect(),
      clientX,
      clientY,
    );
  }, []);

  /**
   * The page is redrawn at the size of this box, so what is on screen is what the browser
   * rendered rather than a shrunken copy of it. Debounced: a window being dragged is one redraw
   * at the end of it. The observer lives here rather than on the page because the box only exists
   * once the picture does — an effect on the page would run before that and watch nothing.
   */
  useEffect(() => {
    const box = surface.current;
    if (box === null) return;
    const observer = new ResizeObserver(() => {
      const rect = box.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width < 1 || height < 1) return;
      const key = `${width}x${height}`;
      if (key === drawnAt.current) return;
      drawnAt.current = key;
      setTimeout(() => {
        if (drawnAt.current !== key) return;
        void api.resizeServerBrowser(width, height).then(onStatus, () => {});
      }, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [onStatus]);

  /**
   * The wheel is the one input React cannot take: it attaches `wheel` passively, so a handler
   * there cannot stop the page underneath from scrolling as well. A native listener can.
   */
  useEffect(() => {
    const box = surface.current;
    if (box === null) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const at = point(event.clientX, event.clientY);
      if (at === null) return;
      send({ type: "wheel", ...at, deltaY: event.deltaY, deltaX: event.deltaX });
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [point, send]);
  const mouse =
    (action: "move" | "down" | "up") =>
    (event: React.MouseEvent<HTMLDivElement>): void => {
      const at = point(event.clientX, event.clientY);
      if (at === null) return;
      send({
        type: "mouse",
        action,
        ...at,
        button: event.button === 2 ? "right" : event.button === 1 ? "middle" : "left",
        buttons: event.buttons,
        ...(action === "move" ? {} : { clickCount: event.detail }),
      });
    };
  const key =
    (action: "down" | "up") =>
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      // While an input method is composing, the keys are its business: they are not characters
      // yet (the composed text arrives as one piece below), and forwarding or swallowing them
      // here would both send the page the wrong thing and cut the composition short.
      if (event.nativeEvent.isComposing || event.key === "Process") return;
      event.preventDefault();
      // Printable keys carry their text so the page receives a real character; everything else is
      // a named key the page's own handlers see.
      const text =
        action === "down" && event.key.length === 1 && !event.ctrlKey && !event.metaKey
          ? event.key
          : undefined;
      send({
        type: "key",
        action,
        key: event.key,
        code: event.code === "" ? undefined : event.code,
        keyCode: event.keyCode === 0 ? undefined : event.keyCode,
        ...(text === undefined ? {} : { text }),
      });
    };

  /**
   * Text that arrived as a whole — an input method committing, or a character inserted some way
   * other than a key press. It goes to the page as one `insertText` rather than as keys, and the
   * element it was composed in is emptied so the same text is not sent twice. What the element
   * holds is the truth; the composition's own last string is what stands in when the browser has
   * already taken the text back out of it.
   */
  const composed = useCallback(
    (committed: string): void => {
      const box = field.current;
      if (box === null) return;
      const text = box.value === "" ? committed : box.value;
      if (text === "") return;
      box.value = "";
      send({ type: "text", text });
    },
    [send],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-[--line] bg-[--surface-sunken]">
      <div
        ref={surface}
        className="relative aspect-[16/10] w-full outline-none"
        tabIndex={0}
        aria-label={S.serverBrowser.pageTitle}
        onMouseDown={mouse("down")}
        onMouseUp={mouse("up")}
        onMouseMove={mouse("move")}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={key("down")}
        onKeyUp={key("up")}
      >
        {stream === "ended" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {S.serverBrowser.streamEnded}
            </p>
            <Button size="sm" variant="secondary" onClick={onReconnect}>
              {S.serverBrowser.reload}
            </Button>
          </div>
        ) : (
          <>
            <img
              ref={image}
              // Pointed at the stream, so the browser is started and the picture begins arriving
              // as soon as this page is open.
              src={`${api.SERVER_BROWSER_FRAMES_URL}?v=${streamKey}`}
              alt={address === "" ? S.serverBrowser.empty : address}
              className="h-full w-full object-contain"
              draggable={false}
              onLoad={() => onStream("live")}
              onError={() => onStream("ended")}
            />
            {/* Before the first frame: what the picture would be of. A stream that has not
                produced anything yet is not a stream that broke, and the two are said apart. */}
            {stream === "none" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-6 text-center">
                <p className="text-sm font-medium">{S.serverBrowser.idleTitle}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {S.serverBrowser.idleBody}
                </p>
              </div>
            )}
            {/* What an input method composes into: invisible, over everything, and the thing a
                click on the picture focuses. Without it a composed character has nowhere to land
                and is lost — the keyboard path carries keys, and a composed string is not one. */}
            <textarea
              ref={field}
              aria-label={S.serverBrowser.inputSurface}
              tabIndex={-1}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              className="absolute inset-0 h-full w-full resize-none overflow-hidden border-0 bg-transparent text-transparent caret-transparent outline-none"
              onCompositionEnd={(event) => composed(event.data)}
              // Text that arrives without a composition — an insert from the browser rather than a
              // key press — is text as well. During a composition it is not yet: that is what
              // `composed` is for, when it commits.
              onInput={(event) => {
                if (!event.nativeEvent.isComposing) composed("");
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** A line of trouble, in the place the picture would be. */
function Notice({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-[--line] bg-[--surface-sunken] px-3 py-2 text-sm">
      {text}
    </div>
  );
}

/** The browser cannot run on this machine: the reason, and what names one that can. */
function Unavailable({ reason }: { reason: string | null }) {
  // The server's own sentence names the switch, which is what tells the two cases apart; it is
  // shown beside the localized line rather than instead of it.
  const off = reason !== null && reason.includes("ADELIE_SERVER_BROWSER=off");
  return (
    <div className="rounded-lg border border-[--line] bg-[--surface-sunken] p-6">
      <h2 className="text-sm font-medium">{S.serverBrowser.unavailableTitle}</h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {off ? S.serverBrowser.unavailableOff : S.serverBrowser.unavailableNoBrowser}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {S.serverBrowser.unavailableBody}
        {reason === null || off ? "" : `（${reason}）`}
      </p>
    </div>
  );
}
