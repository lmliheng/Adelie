/**
 * reply-image.ts: how an image src in a conversation's Markdown is sorted. The srcs here are the
 * shapes the renderer actually hands the image adapter — micromark percent-encodes non-ASCII, and
 * react-markdown empties any scheme it does not trust — which md.test.ts pins through the real
 * pipeline.
 */
import { describe, expect, it } from "vitest";
import { resolveReplyImage } from "../src/lib/reply-image";

const WS = "/home/user/workspaces/tmp-1";

describe("resolveReplyImage", () => {
  it("a relative src is a Workspace file", () => {
    expect(resolveReplyImage("shot.png", WS)).toEqual({ kind: "file", path: "shot.png" });
    expect(resolveReplyImage("shots/cat.png", WS)).toEqual({ kind: "file", path: "shots/cat.png" });
  });

  it("a leading ./ and inner . segments drop", () => {
    expect(resolveReplyImage("./shot.png", WS)).toEqual({ kind: "file", path: "shot.png" });
    expect(resolveReplyImage("./sub/./a.png", WS)).toEqual({ kind: "file", path: "sub/a.png" });
  });

  it("percent-encoding is decoded, so CJK and spaced names resolve to the name on disk", () => {
    expect(resolveReplyImage("%E9%B9%88%E9%B9%95.png", WS)).toEqual({
      kind: "file",
      path: "鹈鹕.png",
    });
    expect(resolveReplyImage("shots/%E7%8C%AB%20v2.png", WS)).toEqual({
      kind: "file",
      path: "shots/猫 v2.png",
    });
  });

  it("a cache-busting query or hash is ignored for the lookup", () => {
    expect(resolveReplyImage("shot.png?v=2", WS)).toEqual({ kind: "file", path: "shot.png" });
    expect(resolveReplyImage("shot.png#crop", WS)).toEqual({ kind: "file", path: "shot.png" });
    expect(resolveReplyImage("?v=2", WS)).toEqual({ kind: "none" });
  });

  it("a .. that climbs out of the Workspace goes nowhere; one that stays inside pops", () => {
    expect(resolveReplyImage("../secret.png", WS)).toEqual({ kind: "none" });
    expect(resolveReplyImage("a/../b.png", WS)).toEqual({ kind: "file", path: "b.png" });
  });

  it("an absolute path counts inside the Workspace and nowhere else", () => {
    expect(resolveReplyImage(`${WS}/shots/cat.png`, WS)).toEqual({
      kind: "file",
      path: "shots/cat.png",
    });
    expect(resolveReplyImage("/home/user/elsewhere/cat.png", WS)).toEqual({ kind: "none" });
    // A drive letter is a scheme as the URL parser reads one, exactly as it is for a link — and
    // the renderer empties such a path before the adapter ever sees it.
    expect(resolveReplyImage("C:\\ws\\shots\\cat.png", "C:/ws")).toEqual({ kind: "external" });
  });

  it("a scheme or a protocol-relative host is the browser's own business", () => {
    for (const src of [
      "https://example.com/a.png",
      "http://example.com/a.png",
      "data:image/png;base64,AA",
      "blob:http://localhost:4000/abc",
      "//cdn.example.com/a.png",
    ]) {
      expect(resolveReplyImage(src, WS)).toEqual({ kind: "external" });
    }
  });

  it("an in-page reference, an emptied src and a missing one go nowhere", () => {
    expect(resolveReplyImage("#crop", WS)).toEqual({ kind: "none" });
    expect(resolveReplyImage("", WS)).toEqual({ kind: "none" });
    expect(resolveReplyImage(undefined, WS)).toEqual({ kind: "none" });
    // react-markdown empties the schemes it does not trust, drive-letter paths included, so the
    // adapter is handed "" rather than a path it could resolve.
    expect(resolveReplyImage("", "C:/ws")).toEqual({ kind: "none" });
  });

  it("with no Workspace a relative src still names a path inside it — the same answer a link gets", () => {
    // Nothing here doubles as a check that the Workspace exists: a relative src means "a file of
    // this Session's Workspace" whatever that directory turns out to be, and a surface with no
    // Session to read from installs no resolver at all (workspace-refs.tsx).
    expect(resolveReplyImage("shot.png", null)).toEqual({ kind: "file", path: "shot.png" });
    expect(resolveReplyImage("https://example.com/a.png", null)).toEqual({ kind: "external" });
    expect(resolveReplyImage("/home/user/elsewhere/cat.png", null)).toEqual({ kind: "none" });
  });
});
