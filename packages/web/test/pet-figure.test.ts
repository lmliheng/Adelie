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
 * - Both figures draw through the map, which is what the pet page looks the choice up in.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_PET_FIGURE,
  isPetFigure,
  PET_FIGURES,
  PET_FIGURE_KEY,
  readPetFigure,
  subscribePetFigure,
  writePetFigure,
} from "../src/lib/pet-figure";
import { usePetFigure } from "../src/lib/use-pet-figure";
import { PET_FIGURE_VIEWS } from "../src/features/pet/figures";
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

    writePetFigure("whale", storage);

    expect(storage.map.get(PET_FIGURE_KEY)).toBe("whale");
    expect(readPetFigure(storage)).toBe("whale");
  });

  it("swallows a storage that refuses the write", () => {
    expect(() => writePetFigure("whale", blockedStorage())).not.toThrow();
  });

  it("tells the renderers following it, and stops telling one that unsubscribed", () => {
    const heard = vi.fn();
    const stop = subscribePetFigure(heard);
    try {
      writePetFigure("whale", memoryStorage());
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
    expect(html).not.toContain("#4d6bfe"); // the whale's blue
  });

  it("is the whale once one is, carrying the classes the stylesheet animates", () => {
    stubLocalStorage(memoryStorage({ [PET_FIGURE_KEY]: "whale" }));

    const html = drawn();

    expect(html).toContain("#4d6bfe");
    expect(html).toContain('class="pet-eyes"');
    expect(html).toContain('class="pet-pupils"');
    expect(html).not.toContain("#f59e0b"); // the penguin's beak and feet
  });
});
