/**
 * The single byte range a `Range` header asks for, as the Workspace file-content route serves
 * it. Kept here (rather than inline in the route) so the header grammar is decided by one pure
 * function with its own tests, and so the route reads as "answer the range, or the whole file".
 *
 * Only one range is honored. A multi-range request (`bytes=0-1,5-6`) is answered with the whole
 * file rather than a multipart body: RFC 9110 lets a server ignore `Range` entirely, and the
 * only clients asking for several ranges at once are download managers — a video element asks
 * for one. Everything malformed is ignored the same way, for the same reason.
 *
 * The distinction that does matter is **unsatisfiable** versus **ignored**: a range whose first
 * byte is at or past the end of the file is a 416 whose `Content-Range` names the size with no
 * satisfiable span, which is how a media element learns the file is shorter than the offset it
 * is seeking to (a rewritten, truncated file), instead of being handed a 200 with the whole file
 * it just told us it does not want.
 */
export type ByteRangeAnswer =
  /** No usable range: serve the file whole. A legal answer to any `Range` request. */
  | { kind: "whole" }
  /** The bytes to serve, inclusive on both ends. */
  | { kind: "partial"; start: number; end: number }
  /** The range begins past the end of the file — a 416. */
  | { kind: "unsatisfiable" };

const RANGE_RE = /^bytes=(\d*)-(\d*)$/;

/** How `header` applies to a body of `size` bytes. */
export function parseByteRange(header: string | undefined, size: number): ByteRangeAnswer {
  if (header === undefined) return { kind: "whole" };
  const match = RANGE_RE.exec(header.trim());
  if (match === null) return { kind: "whole" };
  const [, rawStart, rawEnd] = match;
  // `bytes=-` names nothing; `bytes=0-1,5-6` does not match the pattern above at all.
  if (rawStart === "" && rawEnd === "") return { kind: "whole" };

  if (rawStart === "") {
    // Suffix form: the LAST n bytes. `bytes=-0` asks for nothing, which is unsatisfiable; a
    // suffix longer than the file is the whole file, not an error.
    const wanted = Number(rawEnd);
    if (!Number.isSafeInteger(wanted)) return { kind: "whole" };
    if (wanted === 0) return { kind: "unsatisfiable" };
    if (size === 0) return { kind: "unsatisfiable" };
    return { kind: "partial", start: Math.max(0, size - wanted), end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isSafeInteger(start)) return { kind: "whole" };
  // Past the end (including any offset in an empty file): nothing can satisfy it.
  if (start >= size) return { kind: "unsatisfiable" };
  if (rawEnd === "") return { kind: "partial", start, end: size - 1 };
  const end = Number(rawEnd);
  if (!Number.isSafeInteger(end)) return { kind: "whole" };
  // A backwards range is malformed, and the browser never sends one.
  if (end < start) return { kind: "whole" };
  // A range wider than the file ends with the file's last byte, not an error.
  return { kind: "partial", start, end: Math.min(end, size - 1) };
}
