/**
 * Real-time voice transport: `GET /api/realtime` (Upgrade).
 *
 * The pet's call is one WebSocket from the browser window to this server, and another from this
 * server to the provider. Why two: the credential. A browser that talked to the provider directly
 * would have to be handed the deployment's key, and every page in every window could read it; here
 * the key is added on this hop and never leaves the server.
 *
 * Everything else is a pipe, on purpose. The frames in both directions are the provider's own
 * protocol, so the session is configured by ONE frame this server sends the moment the upstream
 * connection opens (`session.update`, services/realtime.ts) and the browser only ever adds audio,
 * asks for a response, or cancels one. That is also why the model cannot be switched mid-call:
 * the provider names it in the connection's own query string.
 *
 * Auth and Origin are the terminal stream's rules, for the same reason — see http/ws-upgrade.ts.
 * A call is not a credential-bearing route of its own: any signed-in session of this server may
 * open one, exactly as anyone may use the composer's microphone once the admin configured it.
 */
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { SESSION_COOKIE } from "../auth/middleware.js";
import { isAllowedOrigin, readCookie, refuseUpgrade as refuse } from "../http/ws-upgrade.js";
import type { Auth } from "../mechanisms/identity.js";
import type { RealtimeSettings } from "../mechanisms/settings.js";
import {
  isRealtimeId,
  realtimeModel,
  realtimeSession,
  realtimeVoice,
  realtimeWebSocketUrl,
} from "../services/realtime.js";
import type { RealtimeTarget } from "../services/realtime.js";

/** The one path this module upgrades. `/api/realtime/config` and its siblings are the REST routes. */
const REALTIME_PATH = "/api/realtime";

/**
 * The largest single frame a browser may send. A 100 ms chunk of 16 kHz PCM16 is ~3 KB of base64,
 * and a typed message is shorter than that, so anything near this is a client that is not this
 * product — and is dropped rather than forwarded.
 */
const MAX_CLIENT_FRAME = 1024 * 1024;

/** How many frames may wait for the upstream connection before the earliest are dropped. */
const MAX_PENDING = 200;

export interface RealtimeWebSocketDeps {
  /** Read per handshake, so a settings change applies to the next call without a restart. */
  settings: { getRealtimeSettings(): RealtimeSettings };
  authService: Auth;
  log: (line: string) => void;
}

export function attachRealtimeWebSocket(server: HttpServer, deps: RealtimeWebSocketDeps): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // Not ours: leave the socket alone so another upgrade handler can deal with it.
    if (url.pathname !== REALTIME_PATH) return;

    if (!isAllowedOrigin(req)) return refuse(socket, 403, "Forbidden");

    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const authed = token ? deps.authService.authenticateWithMeta(token) : null;
    if (!authed) return refuse(socket, 401, "Unauthorized");

    const settings = deps.settings.getRealtimeSettings();
    // Refused before the upgrade rather than after: with no key there is nothing to relay, and a
    // browser that gets a failed handshake knows at once instead of waiting on a dead session.
    if (settings.apiKey === "") return refuse(socket, 503, "Not Configured");

    // The path, not the setting, names the model and voice — the page may prefer a voice for one
    // call, and both are validated here because both reach the provider's URL and protocol.
    const model = url.searchParams.get("model") ?? "";
    const voice = url.searchParams.get("voice") ?? "";
    for (const value of [model, voice]) {
      if (value !== "" && !isRealtimeId(value)) return refuse(socket, 400, "Bad Request");
    }

    const target: RealtimeTarget & { apiKey: string } = {
      baseUrl: settings.baseUrl,
      model: realtimeModel(model === "" ? settings.model : model),
      voice: realtimeVoice(voice === "" ? settings.voice : voice),
      apiKey: settings.apiKey,
    };
    wss.handleUpgrade(req, socket, head, (client) => relay(client, target, deps.log));
  });
}

/**
 * One call: a browser socket and the upstream connection that answers it, each frame passed to the
 * other unchanged, and either end's death ending both. Frames that arrive before the upstream
 * connection is open are held (bounded) rather than dropped, and the session update is sent first
 * so it can never be overtaken by audio.
 */
function relay(
  client: WebSocket,
  target: RealtimeTarget & { apiKey: string },
  log: (line: string) => void,
): void {
  const upstream = new WebSocket(realtimeWebSocketUrl(target.baseUrl, target.model), {
    headers: { Authorization: `Bearer ${target.apiKey}` },
  });
  const pending: string[] = [];
  let upstreamOpen = false;
  let closed = false;

  const shutdown = (code = 1000, reason = "") => {
    if (closed) return;
    closed = true;
    try {
      if (client.readyState === WebSocket.OPEN) client.close(code, reason);
    } catch {
      // already gone
    }
    try {
      if (upstream.readyState <= WebSocket.OPEN) upstream.close();
    } catch {
      // already gone
    }
  };

  /** The provider's refusal, handed to the page as a frame it already knows how to show. */
  const fail = (message: string) => {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "proxy.error", message }));
      }
    } catch {
      // already gone
    }
    shutdown(1011, "upstream");
  };

  upstream.on("open", () => {
    upstreamOpen = true;
    // The session first: it names the voice and the formats, and audio that overtook it would be
    // interpreted as whatever the provider's default happens to be.
    upstream.send(
      JSON.stringify({ type: "session.update", session: realtimeSession(target.voice) }),
    );
    for (const text of pending.splice(0)) upstream.send(text);
  });

  upstream.on("message", (data: Buffer, isBinary: boolean) => {
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(data, { binary: isBinary });
  });

  upstream.on("unexpected-response", (_request, response) => {
    let body = "";
    response.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    response.on("end", () => {
      const detail = body.trim().slice(0, 200);
      fail(
        `The speech service rejected the connection (HTTP ${response.statusCode ?? 0})${detail === "" ? "." : `: ${detail}`}`,
      );
    });
  });

  upstream.on("error", (err: Error) => {
    log(`[realtime] upstream failed: ${err.message}`);
    fail("Could not reach the speech service.");
  });

  upstream.on("close", (code: number, reason: Buffer) => {
    const text = reason.toString().slice(0, 120);
    shutdown(code === 1000 ? 1000 : 1011, text);
  });

  client.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) return; // every frame of this protocol is JSON
    const text = data.toString();
    if (text.length > MAX_CLIENT_FRAME) return;
    if (!upstreamOpen) {
      if (pending.length < MAX_PENDING) pending.push(text);
      return;
    }
    upstream.send(text);
  });

  client.on("close", () => shutdown(1000));
  client.on("error", () => shutdown(1011));
}
