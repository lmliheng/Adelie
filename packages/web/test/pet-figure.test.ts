/**
 * The pet's figure (lib/pet-figure.ts): which drawing the shell's companion window shows, and the
 * map the pet page looks it up in (features/pet/figures.ts).
 *
 * - A browser that has never chosen gets the penguin — the drawing this page had before the choice
 *   existed — and so does one holding anything that is not a figure this build draws: absent, empty,
 *   wrong case, a name a later release dropped.
 * - A choice round-trips through the storage it was given, and the read is that storage, not the
 *   global.
 * - Storage that refuses every call (site data blocked) answers the default and swallows the write,
 *   rather than taking a render down with it.
 * - A write tells the renderers following it, and stops telling the one that unsubscribed.
 * - Every figure draws through the map, which is what the pet page looks the choice up in — and a
 *   name no figure answers to any more (the retired `whale`) draws the penguin like any other.
 * - The figures after the penguin: the shipped whale girl, drawn from its own image, and the
 *   reader's own picture, which lives in a key of its own — a write to either key is a change to
 *   both, and a `picture` choice with no picture stored draws the penguin rather than an empty box.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_PET_FIGURE,
  isPetFigure,
  PET_FIGURES,
  PET_FIGURE_KEY,
  PET_PICTURE_KEY,
  readPetFigure,
  readPetPicture,
  subscribePetFigure,
  writePetFigure,
  writePetPicture,
} from "../src/lib/pet-figure";
import { usePetFigure } from "../src/lib/use-pet-figure";
import { PET_FIGURE_VIEWS } from "../src/features/pet/figures";
import { PetPicture } from "../src/features/pet/picture";
import { WhaleGirl } from "../src/features/pet/whale-girl";
import { blockedStorage, memoryStorage, stubLocalStorage } from "./helpers/storage";

/** A store holding `value` under the figure key, or nothing when it is null. */
const storageWith = (value: string | null) =>
  memoryStorage(value === null ? {} : { [PET_FIGURE_KEY]: value });

describe("readPetFigure", () => {
  it("is the penguin when nothing is stored", () => {
    expect(readPetFigure(storageWith(null))).toBe("penguin");
    expect(DEFAULT_PET_FIGURE).toBe("penguin");
  });

  it("is the penguin for anything that is not a figure this build draws", () => {
    for (const raw of ["", " ", "Whale", "PENGUIN", " penguin", "penguin ", "shark", "null"]) {
      expect(readPetFigure(storageWith(raw)), JSON.stringify(raw)).toBe("penguin");
    }
  });

  it("hands back the stored figure when it is one of them", () => {
    for (const figure of PET_FIGURES) {
      expect(readPetFigure(storageWith(figure))).toBe(figure);
    }
  });

  it("answers the default, rather than throwing, when storage refuses to be read", () => {
    expect(readPetFigure(blockedStorage())).toBe("penguin");
  });
});

describe("writePetFigure", () => {
  it("round-trips a choice through the storage it was given", () => {
    const storage = memoryStorage();
    expect(readPetFigure(storage)).toBe("penguin");

    writePetFigure("picture", storage);

    expect(storage.map.get(PET_FIGURE_KEY)).toBe("picture");
    expect(readPetFigure(storage)).toBe("picture");
  });

  it("swallows a storage that refuses the write", () => {
    expect(() => writePetFigure("picture", blockedStorage())).not.toThrow();
  });

  it("tells the renderers following it, and stops telling one that unsubscribed", () => {
    const heard = vi.fn();
    const stop = subscribePetFigure(heard);
    try {
      writePetFigure("picture", memoryStorage());
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }

    writePetFigure("penguin", memoryStorage());
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("isPetFigure", () => {
  it("accepts exactly the names the build draws", () => {
    for (const figure of PET_FIGURES) expect(isPetFigure(figure)).toBe(true);
    for (const value of ["", "Whale", "bird", 0, null, undefined, {}]) {
      expect(isPetFigure(value), String(value)).toBe(false);
    }
  });
});

describe("the `whaleGirl` figure", () => {
  const drawn = (): string =>
    renderToStaticMarkup(createElement(WhaleGirl, { className: "h-full w-full" }));

  it("draws the shipped illustration, contained and not draggable", () => {
    const html = drawn();

    expect(html).toContain('src="/pet-figures/whale-girl.png"');
    expect(html).toContain("object-contain");
    expect(html).toContain('draggable="false"');
    // An image has no eyes for the pointer to move, so no drawing classes ride on it.
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("pet-pupils");
  });
});

describe("the reader's own picture", () => {
  const picture = "data:image/png;base64,iVBORw0KGgo=";
  const storageWithPicture = (value: string | null) =>
    memoryStorage(value === null ? {} : { [PET_PICTURE_KEY]: value });

  it("is null until a picture is stored", () => {
    expect(readPetPicture(storageWithPicture(null))).toBeNull();
    expect(readPetPicture()).toBeNull();
  });

  it("is null for anything that is not a picture this page can draw", () => {
    for (const raw of ["", " ", "blob:http://localhost/x", "/pet/cat.png", "data:text/plain;x"]) {
      expect(readPetPicture(storageWithPicture(raw)), JSON.stringify(raw)).toBeNull();
    }
  });

  it("hands back a stored data: URL", () => {
    expect(readPetPicture(storageWithPicture(picture))).toBe(picture);
  });

  it("round-trips through the storage it was given, and clearing leaves nothing", () => {
    const storage = memoryStorage();

    writePetPicture(picture, storage);
    expect(storage.map.get(PET_PICTURE_KEY)).toBe(picture);
    expect(readPetPicture(storage)).toBe(picture);

    writePetPicture(null, storage);
    expect(readPetPicture(storage)).toBeNull();
  });

  it("answers null and swallows the write where storage is blocked", () => {
    expect(readPetPicture(blockedStorage())).toBeNull();
    expect(() => writePetPicture(picture, blockedStorage())).not.toThrow();
  });

  it("tells the renderers following the figure, because it is the same preference", () => {
    const heard = vi.fn();
    const stop = subscribePetFigure(heard);
    try {
      writePetPicture(picture, memoryStorage());
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });
});

describe("the `picture` figure", () => {
  const picture = "data:image/png;base64,iVBORw0KGgo=";
  const drawn = (): string =>
    renderToStaticMarkup(createElement(PetPicture, { className: "h-full w-full" }));

  it("draws the stored image, contained and not draggable", () => {
    stubLocalStorage(memoryStorage({ [PET_FIGURE_KEY]: "picture", [PET_PICTURE_KEY]: picture }));

    const html = drawn();

    expect(html).toContain(`src="${picture}"`);
    expect(html).toContain("object-contain");
    expect(html).toContain('draggable="false"');
    expect(html).not.toContain("<svg");
  });

  it("is the penguin when the choice is the picture but none is stored", () => {
    stubLocalStorage(memoryStorage({ [PET_FIGURE_KEY]: "picture" }));

    const html = drawn();

    expect(html).toContain("<svg");
    expect(html).toContain("#1f2937"); // the penguin's black silhouette
  });
});

describe("the figure a renderer draws", () => {
  /** The pet page's own two lines, without the page: the figure in force, drawn. */
  function Pet() {
    const [figure] = usePetFigure();
    return createElement(PET_FIGURE_VIEWS[figure], { className: "h-full w-full" });
  }

  const drawn = (): string => renderToStaticMarkup(createElement(Pet));

  it("is the penguin until a choice is stored", () => {
    stubLocalStorage(memoryStorage());

    const html = drawn();

    expect(html).toContain("<svg");
    expect(html).toContain("#1f2937"); // the penguin's black silhouette
    expect(html).not.toContain("<img");
  });

  it("is the whale girl once that is the choice", () => {
    stubLocalStorage(memoryStorage({ [PET_FIGURE_KEY]: "whaleGirl" }));

    const html = drawn();

    expect(html).toContain('src="/pet-figures/whale-girl.png"');
    expect(html).not.toContain("<svg");
  });

  it("is the stored picture once that is the choice", () => {
    stubLocalStorage(
      memoryStorage({ [PET_FIGURE_KEY]: "picture", [PET_PICTURE_KEY]: "data:image/png;base64,AA" }),
    );

    const html = drawn();

    expect(html).toContain('src="data:image/png;base64,AA"');
    expect(html).not.toContain("<svg");
  });

  it("falls back to the penguin for a figure a later release dropped", () => {
    // `whale` is exactly that case: the drawn fish was retired on 2026-11-24.
    stubLocalStorage(memoryStorage({ [PET_FIGURE_KEY]: "whale" }));

    const html = drawn();

    expect(html).toContain("<svg");
    expect(html).toContain("#1f2937");
  });
});
