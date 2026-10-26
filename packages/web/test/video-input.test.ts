/**
 * The video draft's wire shapes (lib/video-input.ts): what a staged clip's data URL is derived
 * from when only a URL comes back, what a task input ends up carrying, and which of the two
 * shapes a steered clip takes.
 *
 * The steer branch is the one with two answers, and the reason this module exists: the server
 * refuses an inline video on a model that takes none — rather than filing it into the scratchpad
 * as a task's `video_url` part is filed — so the composer has to choose the field, and choosing
 * wrong is either a 400 or a clip the model never sees. Everything else here is about the names
 * and sizes a recalled clip's chip can honestly show.
 */
import { describe, expect, it } from "vitest";
import type { TaskInputPart } from "@adelie/server/api";
import {
  appendMediaParts,
  dataUrlBytes,
  steerVideoFields,
  videoFromUrl,
  videoNameForUrl,
} from "../src/lib/video-input";
import type { ComposerVideo } from "../src/lib/video-input";

const MP4 = "data:video/mp4;base64,AAAA";
const clip = (name: string, dataUrl = MP4): ComposerVideo => ({ name, size: 100, dataUrl });

describe("dataUrlBytes", () => {
  it("counts the decoded bytes of a data URL's payload", () => {
    // "AAAA" is 4 base64 chars = 3 bytes; padding is not bytes.
    expect(dataUrlBytes("data:video/mp4;base64,AAAA")).toBe(3);
    expect(dataUrlBytes("data:image/png;base64,AAA=")).toBe(2);
    // Anything without a comma body has nothing to measure.
    expect(dataUrlBytes("https://example.com/clip.mp4")).toBe(0);
  });
});

describe("videoNameForUrl", () => {
  it("names an unnamed (data:) clip after its own media type, like the server does", () => {
    expect(videoNameForUrl(MP4)).toBe("video.mp4");
    expect(videoNameForUrl("data:video/quicktime;base64,AAAA")).toBe("video.mov");
    expect(videoNameForUrl("data:video/webm;base64,AAAA")).toBe("video.webm");
    // A type the list does not know still gets a usable name rather than an extension-less one.
    expect(videoNameForUrl("data:video/ogg;base64,AAAA")).toBe("video");
    expect(videoNameForUrl("data:;base64,AAAA")).toBe("video");
  });

  it("takes an http(s) clip's own last path segment", () => {
    expect(videoNameForUrl("https://example.com/media/clip.mp4")).toBe("clip.mp4");
    // Query strings and fragments are not the name, and escapes are decoded.
    expect(videoNameForUrl("https://example.com/a/b/clip.mp4?token=x#t=1")).toBe("clip.mp4");
    expect(videoNameForUrl("https://example.com/my%20clip.mov")).toBe("my clip.mov");
    // A bare directory or host names nothing: fall back to the same bare name.
    expect(videoNameForUrl("https://example.com/")).toBe("video");
    expect(videoNameForUrl("https://example.com")).toBe("video");
  });
});

describe("videoFromUrl — a recalled clip back in the draft", () => {
  it("moves the bytes through untouched and reports the size a chip can show", () => {
    const restored = videoFromUrl(MP4);
    // The same string, not a re-encode: a clip is tens of megabytes.
    expect(restored.dataUrl).toBe(MP4);
    expect(restored.name).toBe("video.mp4");
    expect(restored.size).toBe(3);
  });

  it("reports no size for a web address it cannot measure", () => {
    const restored = videoFromUrl("https://example.com/clip.mp4");
    expect(restored.size).toBe(0);
    expect(restored.name).toBe("clip.mp4");
  });
});

describe("appendMediaParts — what a task's input carries", () => {
  const parts = (
    images: string[],
    videos: ComposerVideo[],
    files: { name: string; dataUrl: string }[],
  ) => {
    const input: TaskInputPart[] = [{ type: "text", text: "look" }];
    appendMediaParts(input, images, videos, files);
    return input;
  };

  it("appends images, then videos (with the picked name), then files", () => {
    expect(
      parts(
        ["data:image/png;base64,AAAA"],
        [clip("holiday.mp4")],
        [{ name: "notes.txt", dataUrl: "data:text/plain;base64,AAAA" }],
      ),
    ).toEqual([
      { type: "text", text: "look" },
      { type: "image_url", imageUrl: "data:image/png;base64,AAAA" },
      { type: "video_url", videoUrl: MP4, fileName: "holiday.mp4" },
      { type: "file", fileName: "notes.txt", dataUrl: "data:text/plain;base64,AAAA" },
    ]);
  });

  it("sends the clip's data URL by reference and in pick order", () => {
    const first = clip("1.mp4");
    const second = clip("2.mp4");
    const input = parts([], [first, second], []).slice(1); // past the text part
    expect(input.map((p) => (p.type === "video_url" ? p.videoUrl : ""))).toEqual([MP4, MP4]);
    // The URL the part carries IS the staged string (no copy was made on the way).
    expect((input[0] as { videoUrl: string }).videoUrl).toBe(first.dataUrl);
    expect((input[1] as { fileName?: string }).fileName).toBe("2.mp4");
  });

  it("adds nothing for an empty draft", () => {
    expect(parts([], [], [])).toEqual([{ type: "text", text: "look" }]);
  });
});

describe("steerVideoFields — the one branch the composer has to choose", () => {
  it("sends the clips inline on a model that takes video input", () => {
    expect(steerVideoFields([clip("a.mp4"), clip("b.mp4")], true)).toEqual({
      videos: [MP4, MP4],
    });
  });

  it("hands them over as file attachments on a model that takes none, names kept", () => {
    // The server refuses `videos` on such a model (the steer route is not the task route: it has
    // no scratchpad fallback of its own), so the clip must arrive as a file — with the name the
    // user's pick had, because that is what it is filed under on disk.
    expect(steerVideoFields([clip("holiday.mp4")], false)).toEqual({
      files: [{ fileName: "holiday.mp4", dataUrl: MP4 }],
    });
  });

  it("sets neither field for a steer that carries no clip", () => {
    expect(steerVideoFields([], true)).toEqual({});
    expect(steerVideoFields([], false)).toEqual({});
  });
});
