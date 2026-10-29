/**
 * The lightbox's arithmetic (src/components/overlays/lightbox/image-board.ts): stepping through a
 * batch wraps at both ends, the pixel badge speaks only when a picture's own size is known, and a
 * download takes the file's name from where the picture came from.
 */
import { describe, expect, it } from "vitest";
import {
  downloadName,
  pixelSizeLabel,
  stepIndex,
} from "../src/components/overlays/lightbox/image-board";

describe("stepIndex", () => {
  it("steps forward and back inside the batch", () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, -1, 3)).toBe(1);
  });

  it("wraps at both ends, because the batch is a carousel", () => {
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
  });

  it("keeps a single picture where it is, and an empty batch at 0", () => {
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, -1, 1)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe("pixelSizeLabel", () => {
  it("reads the picture's own size, with the multiplication sign between them", () => {
    expect(pixelSizeLabel(2364, 1773)).toBe("2364 × 1773");
  });

  it("says nothing while the size is unknown — an unloaded image reports 0", () => {
    expect(pixelSizeLabel(0, 0)).toBeNull();
    expect(pixelSizeLabel(1280, 0)).toBeNull();
    expect(pixelSizeLabel(Number.NaN, 720)).toBeNull();
    expect(pixelSizeLabel(Number.POSITIVE_INFINITY, 720)).toBeNull();
  });

  it("rounds a fractional size rather than printing it", () => {
    expect(pixelSizeLabel(1280.4, 719.6)).toBe("1280 × 720");
  });
});

describe("downloadName", () => {
  it("takes the last segment of a URL, without its query or fragment", () => {
    expect(downloadName("https://example.test/a/quarterly-report.pdf#page=2")).toBe(
      "quarterly-report.pdf",
    );
    expect(downloadName("shot.png")).toBe("shot.png");
  });

  it("takes the name a route carries in `path=` when its own segment is only an id", () => {
    // The app serves a workspace picture at …/files/content?path=shot.png.
    expect(downloadName("/api/sessions/s-1/files/content?path=shot.png")).toBe("shot.png");
    expect(downloadName("/api/sessions/s-1/files/content?path=docs%2Fshot.png")).toBe("shot.png");
    // A segment that already names a file wins over the query.
    expect(downloadName("/files/shot.png?path=other.png")).toBe("shot.png");
  });

  it("decodes what the URL encoded, so the saved file has the name the user saw", () => {
    expect(
      downloadName("https://example.test/reports/%E5%AD%A3%E5%BA%A6%E6%8A%A5%E5%91%8A.pdf"),
    ).toBe("季度报告.pdf");
    expect(downloadName("/a/shot%201.png")).toBe("shot 1.png");
  });

  it("names a data URL after its media type, since it has no name of its own", () => {
    expect(downloadName("data:image/png;base64,iVBORw0KGgo=")).toBe("image.png");
    expect(downloadName("data:image/jpeg;base64,/9j/4AAQ")).toBe("image.jpg");
    expect(downloadName("data:image/svg+xml;utf8,<svg/>")).toBe("image.svg");
    expect(downloadName("data:image/webp;base64,UklGR")).toBe("image.webp");
  });

  it("falls back when nothing names the file, keeping the extension with the name", () => {
    expect(downloadName("blob:https://app.test/6f1c", "image")).toBe("image");
    expect(downloadName("", "image")).toBe("image");
    expect(downloadName("data:text/plain,hello", "image")).toBe("image");
    expect(downloadName("https://example.test/", "image")).toBe("image");
    expect(downloadName("blob:https://app.test/6f1c", "download")).toBe("download");
  });

  it("keeps a stray percent sign rather than failing the whole name", () => {
    expect(downloadName("/a/100%_done.png")).toBe("100%_done.png");
  });
});
