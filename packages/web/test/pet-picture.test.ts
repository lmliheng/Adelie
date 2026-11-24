/**
 * Turning a picked file into the picture the pet draws (lib/pet-picture.ts).
 *
 * The canvas half is the browser's, so what is pinned here is the wiring that decides what comes
 * out of it: the shape stays the file's, the long side is capped, the bytes are re-encoded as PNG
 * (a drawing picked for its transparent background must not come back as JPEG), and the file is
 * refused before any of that when it is not an image or when the browser cannot decode it.
 *
 * The pure half — `fitWithin` — is checked exhaustively: it is the one piece of arithmetic between
 * a 4000px illustration and the couple of hundred pixels the preference store can carry.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fitWithin, PET_PICTURE_MAX_PX, pictureDataUrlFromFile } from "../src/lib/pet-picture";

/** A file stub: the module reads `type`, and everything else about it is the browser's business. */
const fileOfType = (type: string) => ({ type }) as unknown as File;

/**
 * The smallest canvas environment `pictureDataUrlFromFile` touches: a canvas that records the size
 * it was drawn at, an image that decodes on demand, and an object URL that is not a real blob.
 */
function stubCanvasBox(options: { natural: { width: number; height: number }; fail?: boolean }) {
  const drawn: Array<{ width: number; height: number }> = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (_image: unknown, _x: number, _y: number, width: number, height: number) =>
        drawn.push({ width, height }),
    }),
    toDataURL: (type: string) => `data:${type};stub`,
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = options.natural.width;
      naturalHeight = options.natural.height;
      onload: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => {
          if (options.fail === true) this.onerror?.(new Event("error"));
          else this.onload?.();
        });
      }
    },
  );
  vi.stubGlobal("URL", { createObjectURL: () => "blob:stub", revokeObjectURL: () => undefined });
  return { drawn, canvas };
}

afterEach(() => vi.unstubAllGlobals());

describe("fitWithin", () => {
  it("keeps a picture that already fits, exactly", () => {
    expect(fitWithin(72, 72)).toEqual({ width: 72, height: 72 });
    expect(fitWithin(100, 250)).toEqual({ width: 100, height: 250 });
    expect(fitWithin(PET_PICTURE_MAX_PX, PET_PICTURE_MAX_PX)).toEqual({
      width: PET_PICTURE_MAX_PX,
      height: PET_PICTURE_MAX_PX,
    });
  });

  it("scales the long side down to the cap and keeps the shape", () => {
    expect(fitWithin(1000, 500)).toEqual({ width: 256, height: 128 });
    expect(fitWithin(500, 1000)).toEqual({ width: 128, height: 256 });
    expect(fitWithin(1000, 1000)).toEqual({ width: 256, height: 256 });
  });

  it("never returns a side below one pixel", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 });
    expect(fitWithin(1, 4000)).toEqual({ width: 1, height: 256 });
    expect(fitWithin(3, 4000)).toEqual({ width: 1, height: 256 });
  });

  it("takes the cap it is given", () => {
    expect(fitWithin(100, 400, 100)).toEqual({ width: 25, height: 100 });
  });
});

describe("pictureDataUrlFromFile", () => {
  it("refuses a file that is not an image, without reading it", async () => {
    const result = await pictureDataUrlFromFile(fileOfType("text/plain"));

    expect(result).toEqual({ ok: false, reason: "not_an_image" });
  });

  it("answers `unreadable` for bytes the browser will not decode", async () => {
    stubCanvasBox({ natural: { width: 0, height: 0 }, fail: true });

    const result = await pictureDataUrlFromFile(fileOfType("image/png"));

    expect(result).toEqual({ ok: false, reason: "unreadable" });
  });

  it("re-encodes the picture as PNG, sized to the cap", async () => {
    const { canvas, drawn } = stubCanvasBox({ natural: { width: 1000, height: 500 } });

    const result = await pictureDataUrlFromFile(fileOfType("image/png"));

    expect(result).toEqual({ ok: true, dataUrl: "data:image/png;stub" });
    expect(drawn).toEqual([{ width: 256, height: 128 }]);
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 256, height: 128 });
  });
});
