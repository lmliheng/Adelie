/**
 * The one transport that reports how much of its body has gone out.
 *
 * `fetch` has no upload-progress event at all, so a request that needs one has to go out as an
 * XMLHttpRequest. Two calls need it: the direct attachment upload (a raw `File`, streamed from
 * disk — a `Blob` body is handed to the browser as-is, never read into a string here) and the
 * task/steer routes when a message still carries its bytes inline as base64 `data:` URLs (small
 * attachments only; anything large has been uploaded separately — see chat-input.tsx).
 *
 * The answer is handed back as a real `Response`, not as XHR's own result shape, so everything
 * downstream of the transport — the non-2xx → ApiError mapping, the `Date`/`ETag` reads, the empty
 * body handling — is the very same code the `fetch` path runs, and the two cannot drift apart in
 * what they mean.
 *
 * The XHR constructor is a parameter so a test can pass its own: this package's tests run in node,
 * which has no `XMLHttpRequest` at all.
 */

/** Makes the request object — the seam a test replaces. */
export type XhrFactory = () => XMLHttpRequest;

/**
 * XHR's `status` values that must not carry a body — `new Response(text, …)` refuses anything else
 * for these. 101 is a protocol switch it cannot represent; the rest are the null-body statuses.
 */
const NO_BODY_STATUS = new Set([101, 204, 205, 304]);

/** `getAllResponseHeaders()`'s raw block as a `Headers` (same access a `fetch` response would give). */
function parseResponseHeaders(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return headers;
}

/** Applies `fetch`'s `HeadersInit` shapes (object, array or `Headers`) onto the XHR. */
function applyHeaders(xhr: XMLHttpRequest, headers: HeadersInit | undefined): void {
  if (headers === undefined) return;
  const pairs: readonly (readonly [string, string])[] =
    headers instanceof Headers
      ? [...headers.entries()]
      : Array.isArray(headers)
        ? headers
        : Object.entries(headers);
  for (const [name, value] of pairs) xhr.setRequestHeader(name, value);
}

/**
 * Sends `init` with XHR, reporting the upload's progress, and resolves to a `Response` carrying the
 * status, status text, headers and body the server answered with. Rejects on a network-level
 * failure (which the caller reads as its own `network_error`) and on an abort.
 */
export function xhrUpload(
  url: string,
  init: RequestInit,
  onProgress: (sent: number, total: number) => void,
  makeXhr: XhrFactory = () => new XMLHttpRequest(),
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = makeXhr();
    xhr.open(init.method ?? "GET", url, true);
    // Same-origin cookie auth, exactly what `credentials: "same-origin"` asks of `fetch`. The two
    // routes this carries are both same-origin (a machine-routed path is re-rooted under
    // `/server/<id>`, not moved to another origin), so a cross-origin rule would never apply.
    xhr.withCredentials = true;
    applyHeaders(xhr, init.headers === undefined ? undefined : init.headers);
    xhr.upload.onprogress = (event) => {
      // No `lengthComputable` means the browser cannot say how big the body is: a reading against
      // an unknown total would be a percentage of nothing, so there is no reading to report.
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onload = () =>
      resolve(
        new Response(NO_BODY_STATUS.has(xhr.status) ? null : xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: parseResponseHeaders(xhr.getAllResponseHeaders()),
        }),
      );
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.ontimeout = () => reject(new Error("upload timed out"));
    xhr.onabort = () => reject(new Error("upload aborted"));
    const signal = init.signal;
    if (signal) {
      const abort = () => xhr.abort();
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      xhr.addEventListener("loadend", () => signal.removeEventListener("abort", abort));
    }
    xhr.send(typeof init.body === "string" || init.body instanceof Blob ? init.body : null);
  });
}
