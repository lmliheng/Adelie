/**
 * The `Range` header a Workspace file read may carry (services/byte-range.ts).
 *
 * - A single range resolves to the bytes it names, inclusive at both ends, clamped to the file:
 *   `bytes=0-1` is two bytes, `bytes=6-` runs to the last one, a range past the end stops at it.
 * - The suffix form counts back from the end; a suffix longer than the file is the whole file.
 * - Everything else — no header, several ranges, a malformed or backwards one, a number too
 *   large to hold — is ignored, and the whole file is the answer.
 * - Only a range that starts at or past the end is unsatisfiable (a 416): that is the one a
 *   media element acts on, learning the file is shorter than the offset it seeks to.
 */
import { describe, expect, it } from "vitest";
import { parseByteRange } from "../src/services/byte-range.js";

const SIZE = 10;

describe("parseByteRange", () => {
  it("answers the whole file when there is no Range header at all", () => {
    expect(parseByteRange(undefined, SIZE)).toEqual({ kind: "whole" });
  });

  it("resolves a closed range, inclusive at both ends", () => {
    expect(parseByteRange("bytes=0-1", SIZE)).toEqual({ kind: "partial", start: 0, end: 1 });
    expect(parseByteRange("bytes=0-0", SIZE)).toEqual({ kind: "partial", start: 0, end: 0 });
    expect(parseByteRange("bytes=4-7", SIZE)).toEqual({ kind: "partial", start: 4, end: 7 });
  });

  it("runs an open-ended range to the file's last byte", () => {
    expect(parseByteRange("bytes=6-", SIZE)).toEqual({ kind: "partial", start: 6, end: 9 });
    expect(parseByteRange("bytes=0-", SIZE)).toEqual({ kind: "partial", start: 0, end: 9 });
  });

  it("clamps a range that runs past the end instead of failing it", () => {
    expect(parseByteRange("bytes=8-100", SIZE)).toEqual({ kind: "partial", start: 8, end: 9 });
  });

  it("counts a suffix form back from the end", () => {
    expect(parseByteRange("bytes=-3", SIZE)).toEqual({ kind: "partial", start: 7, end: 9 });
    // A suffix longer than the file is the whole file, not an error.
    expect(parseByteRange("bytes=-100", SIZE)).toEqual({ kind: "partial", start: 0, end: 9 });
    expect(parseByteRange("bytes=-10", SIZE)).toEqual({ kind: "partial", start: 0, end: 9 });
  });

  it("is unsatisfiable only when the range begins at or past the end", () => {
    expect(parseByteRange("bytes=10-", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(parseByteRange("bytes=10-20", SIZE)).toEqual({ kind: "unsatisfiable" });
    // Any offset in an empty file is past its end.
    expect(parseByteRange("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
    expect(parseByteRange("bytes=-1", 0)).toEqual({ kind: "unsatisfiable" });
    // Asking for nothing at all is unsatisfiable too.
    expect(parseByteRange("bytes=-0", SIZE)).toEqual({ kind: "unsatisfiable" });
  });

  it("ignores everything it will not answer in slices: several, malformed, backwards, or absurd", () => {
    // Several ranges would need a multipart body; the whole file is a legal answer.
    expect(parseByteRange("bytes=0-1,5-6", SIZE)).toEqual({ kind: "whole" });
    // Not a byte range at all.
    expect(parseByteRange("items=0-1", SIZE)).toEqual({ kind: "whole" });
    expect(parseByteRange("bytes=abc", SIZE)).toEqual({ kind: "whole" });
    // Names nothing.
    expect(parseByteRange("bytes=-", SIZE)).toEqual({ kind: "whole" });
    // Backwards — the browser never sends one.
    expect(parseByteRange("bytes=5-3", SIZE)).toEqual({ kind: "whole" });
    // Too large to be a safe integer.
    expect(parseByteRange("bytes=99999999999999999999-", SIZE)).toEqual({ kind: "whole" });
  });

  it("tolerates surrounding whitespace on the header value", () => {
    expect(parseByteRange("  bytes=2-4  ", SIZE)).toEqual({ kind: "partial", start: 2, end: 4 });
  });
});
