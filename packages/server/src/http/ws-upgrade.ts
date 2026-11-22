/**
 * The three things every WebSocket upgrade on this server has to do for itself, because a
 * WebSocket cannot cross the platform seam: a seam handler returns one whole Response, and an
 * upgrade is a socket that was never one.
 *
 * Shared by the two upgrades that exist — the terminal stream (terminal/ws.ts) and the pet's
 * realtime voice relay (realtime/ws.ts) — because the rules are the same and non-obvious in the
 * same way:
 *
 * - A handshake bypasses CORS, so any origin may attempt one AND the session cookie still rides
 *   along with it. {@link isAllowedOrigin} is therefore the only thing standing between a page
 *   the user happens to visit and a shell on this machine, and it compares the full host:port
 *   rather than the hostname, because cookies are port-agnostic.
 * - The credential is the same session cookie the REST API uses, read off the upgrade request.
 * - A refusal has to be written by hand: there is no response object to hand back, and a socket
 *   left un-answered is a browser hanging on a handshake that will never finish.
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

/**
 * Whether the handshake came from a genuinely same-origin page. Only a genuinely same-origin page
 * may connect: host AND port must match the Host the browser targeted. Anything looser
 * (hostname-only, or a blanket loopback allowance) would let a page served by any other local
 * server ride the session cookie into this one. The Vite dev server proxies with
 * `changeOrigin: false`, so the browser's own Host survives the proxy and this comparison holds in
 * development too. A request with no Origin at all is a non-browser client (a CLI, a test) with no
 * ambient cookie to abuse, and is allowed.
 */
export function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return parsed.host === (req.headers.host ?? "");
}

/** One cookie's value off a raw header, percent-decoded, or null when it is absent or malformed. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      // A malformed percent escape is an invalid credential, not a server error — this runs in
      // the `upgrade` handler, where a throw would take the whole process down.
      return null;
    }
  }
  return null;
}

/** Answers a handshake we will not complete, then hangs up. */
export function refuseUpgrade(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
