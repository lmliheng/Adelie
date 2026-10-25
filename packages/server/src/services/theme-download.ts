/**
 * Remote theme import: one address in, one theme file's bytes out.
 *
 * A theme is a single JSON file, so this is the whole of "download" where a plugin needs an
 * archive reader (services/plugin-download.ts): fetch it, bound it, and hand it over. What the two
 * do share is the safety posture rather than the code, and the load-bearing half of it is IMPORTED
 * rather than copied — `isBlockedHost`, the literal-host guard that refuses the addresses which can
 * only be the server's own network, so a typo or a redirect cannot aim the server at itself.
 *
 * Bounded three ways, for the reason the plugin download states: a deadline, a size cap enforced
 * while streaming (a `content-length` is a claim, and a chunked response makes no claim at all), and
 * a re-check of the host that actually answered. The cap is the format's own
 * ({@link MAX_THEME_FILE_BYTES}), because a file this route writes has to be a file the reader will
 * read afterwards: accepting a byte more would install a theme that never paints.
 *
 * WHAT THIS DOES NOT DO is read the bytes. What a theme is, is core's question and the route asks
 * it, so an upload and a download are judged by one reading rather than two; this module's job ends
 * at "these are the bytes that host served". Every failure is an HttpError the route returns as-is,
 * with the codes the plugin import already answers (`blocked_url`, `download_failed`,
 * `unsupported_url`) plus this route's own 413 `theme_too_large`.
 */
import { MAX_THEME_FILE_BYTES } from "@adelie/core";
import { HttpError } from "../http/errors.js";
import { isBlockedHost } from "./plugin-download.js";

/**
 * How long one download may take. Shorter than a plugin archive's 60s on purpose: this pulls a
 * small JSON file, not a repository checkout, and a bound is what keeps an unresponsive host from
 * pinning a request handler.
 */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Refuses a host that can only be the server's own network (see the module header). */
function assertHostAllowed(url: URL): void {
  if (isBlockedHost(url.hostname)) {
    throw new HttpError(
      400,
      "blocked_url",
      `Refusing to fetch from a local or private host: ${url.hostname}`,
    );
  }
}

/** A file past the format's cap, uploaded or downloaded alike — one answer, one place the number is read. */
export function themeTooLarge(): HttpError {
  return new HttpError(
    413,
    "theme_too_large",
    `The theme file exceeds the ${Math.floor(MAX_THEME_FILE_BYTES / 1024)}KB limit.`,
  );
}

/**
 * Fetches one theme file. `fetchImpl` is the seam the tests use (as the plugin download's own is),
 * so a suite can answer with the bytes of a theme without a network.
 */
export async function fetchThemeFile(
  rawUrl: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new HttpError(400, "unsupported_url", "url must be an absolute http(s) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "unsupported_url", "url must be an http(s) URL.");
  }
  assertHostAllowed(url);

  const doFetch = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      // A theme is JSON, but a host may serve it as text/plain (a raw file link, a gist) — the
      // bytes decide, so the accept header asks without insisting.
      headers: { accept: "application/json, text/plain, */*" },
      signal: AbortSignal.timeout(options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS),
    });
  } catch (err) {
    throw new HttpError(400, "download_failed", `Could not download: ${message(err)}`);
  }
  if (res.url) {
    try {
      assertHostAllowed(new URL(res.url));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, "download_failed", "Could not read the URL that answered.");
    }
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new HttpError(400, "download_failed", `Download failed with HTTP ${res.status}.`);
  }
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_THEME_FILE_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    throw themeTooLarge();
  }
  return readBounded(res);
}

/** Reads the body, refusing the moment it passes the cap rather than after buffering it all. */
async function readBounded(res: Response): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.from(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_THEME_FILE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw themeTooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
