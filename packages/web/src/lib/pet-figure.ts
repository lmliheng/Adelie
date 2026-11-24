/**
 * Which figure the desktop pet draws: the preference behind the Appearance row, and the reason
 * the pet page is not hard-wired to one drawing any more.
 *
 * WHERE IT LIVES. The pet is drawn by this app's /pet page, inside the shell's companion window,
 * and that window is the same origin as every other window of the app — so the two share one
 * `localStorage` and one `storage` event. The choice is therefore a browser preference here, next
 * to the theme and the text size, rather than a second field in the shell's own `pet.json` that
 * the shell would have to learn, persist and relay back to the page that asks the question. The
 * shell still owns whether the pet is shown at all (`showPet`); it has no opinion on what it is.
 * A reader may also draw their own picture instead of either drawing: that image is kept here
 * beside the choice that selects it (see {@link PET_PICTURE_KEY}).
 *
 * `penguin` is the default and the drawing this page had before the choice existed, so a browser
 * that has never stored anything keeps the bird.
 *
 * READING IS SAFE BY CONSTRUCTION: anything that is not one of the names below — absent, an empty
 * string, a hand-edited value, a figure a later release dropped — is the default, and a storage
 * that refuses to be read (site data blocked, a partitioned iframe) answers the default too. That
 * rule has already been used: the drawn fish named `whale` was retired on 2026-11-24 (the owner
 * wanted the community's anthropomorphic "blue fat fish", which is a picture rather than a second
 * drawing of the fish), and every desktop that had picked it now simply draws the penguin again.
 * As in nav-group-collapse.ts, `localStorage` is resolved INSIDE the try rather than as a default
 * parameter, because merely touching it throws where site data is blocked and a `useState`
 * initializer (or a render) must not be taken down by it.
 */

/** The figures the pet can be, in the order the settings row offers them (the default first). */
export const PET_FIGURES = ["penguin", "picture"] as const;

/** One of the pet's drawings; features/pet/figures.ts maps each to the component that draws it. */
export type PetFigure = (typeof PET_FIGURES)[number];

/** What a browser that has never chosen gets: the penguin this page has always drawn. */
export const DEFAULT_PET_FIGURE: PetFigure = "penguin";

/** The key this preference is stored under (a `penguin.…` key; classified in install-scope.ts). */
export const PET_FIGURE_KEY = "penguin.petFigure";

/**
 * Where the reader's own picture lives when the figure is `picture`: a `data:` URL of the image
 * itself, kept beside the choice that selects it instead of on the server.
 *
 * WHY HERE. The choice is a browser preference (see above), and a picture is what that choice can
 * be — so it travels with it: the Appearance row writes both, and the shell's companion window
 * reads both out of the same origin's storage. That is what makes a picture the reader picked
 * appear on the desktop with no reload, no upload and nothing on the server to name it. It is also
 * why a picture is per browser: a second browser draws the drawn figures until a picture is chosen
 * there too.
 *
 * SIZE. `pictureDataUrlFromFile` (lib/pet-picture.ts) shrinks whatever was picked to a couple of
 * hundred pixels on the long side and re-encodes it as PNG, which is a few tens of kilobytes — the
 * pet draws at 72px, so anything larger is bytes the store and the `storage` event would carry for
 * nothing. `localStorage` holds a few of those comfortably; the write is best-effort like every
 * other preference, and a refusal (quota, private browsing) leaves the drawn figure in place.
 */
export const PET_PICTURE_KEY = "penguin.petFigurePicture";

/** The storage this reads and writes — `localStorage`, or a stub in tests. */
export type PetFigureStorage = Pick<Storage, "getItem" | "setItem">;

/** Whether `value` names a figure this build draws. */
export function isPetFigure(value: unknown): value is PetFigure {
  return typeof value === "string" && (PET_FIGURES as readonly string[]).includes(value);
}

function figureIn(storage: PetFigureStorage | null): PetFigure {
  try {
    const raw = storage?.getItem(PET_FIGURE_KEY) ?? null;
    return isPetFigure(raw) ? raw : DEFAULT_PET_FIGURE;
  } catch {
    return DEFAULT_PET_FIGURE;
  }
}

function defaultStorage(): PetFigureStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // the accessor itself throws where site data is blocked
  }
}

/**
 * The figure in force: the stored one when it is a figure this build draws, the default
 * otherwise. An explicit storage (tests) reads that and nothing else.
 */
export function readPetFigure(storage?: PetFigureStorage | null): PetFigure {
  return figureIn(storage === undefined ? defaultStorage() : storage);
}

// --------------------------------------------------------------- the live value
//
// TWO DOCUMENTS RENDER FROM THIS: the Appearance row that offers the choice, and the shell's
// companion window that draws it. They are separate documents with separate module state, so a
// change has to be announced twice — once to the listeners here (the Settings page's own row), and
// once by the browser, as a `storage` event, to the other window. subscribePetFigure listens for
// both. Without the second, switching the figure would leave the pet on the desktop drawing the
// old one until its window happened to reload, which is exactly the moment the user is watching.

/** The renderers following this preference, in this window. */
const figureListeners = new Set<() => void>();

/** The keys the preference is spread over: the choice, and the picture it may name. */
const PET_FIGURE_KEYS: ReadonlySet<string> = new Set([PET_FIGURE_KEY, PET_PICTURE_KEY]);

/**
 * Follows the preference: for a renderer, and for another window of the app changing it. The
 * listener is told on every write in this window and on any `storage` event about either key —
 * the picture and the choice are one preference, so a picture arriving is a change too; the values
 * themselves are read with {@link readPetFigure} and {@link readPetPicture}, so nothing is cached
 * and the store can never disagree with what is stored.
 */
export function subscribePetFigure(listener: () => void): () => void {
  figureListeners.add(listener);
  // A `storage` event only fires in OTHER documents of this origin — the companion window the
  // Settings row just changed. A null key is a `clear()`, which drops this preference too.
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && !PET_FIGURE_KEYS.has(event.key)) return;
    for (const telling of figureListeners) telling();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    figureListeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/**
 * Stores the choice and tells everything rendering from it. Best-effort like every other
 * preference: a refused write (quota, private browsing) still updates this session's renderers,
 * it just does not outlive the tab.
 */
export function writePetFigure(figure: PetFigure, storage?: PetFigureStorage | null): void {
  const target = storage === undefined ? defaultStorage() : storage;
  try {
    target?.setItem(PET_FIGURE_KEY, figure);
  } catch {
    /* best-effort persistence (quota limits / private browsing) */
  }
  for (const listener of figureListeners) listener();
}

/**
 * The picture in force: the stored `data:` URL, or null when there is nothing to draw. Anything
 * that is not an image this page can draw — absent, an empty string, a hand-edited value, a URL to
 * somewhere else — is null, by the same rule that makes an unknown figure the penguin.
 */
export function readPetPicture(storage?: PetFigureStorage | null): string | null {
  const target = storage === undefined ? defaultStorage() : storage;
  try {
    const raw = target?.getItem(PET_PICTURE_KEY) ?? null;
    return raw !== null && raw.startsWith("data:image/") ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Stores the picture and tells everything rendering from it — the same best-effort contract as
 * {@link writePetFigure}, and the same listeners: a picture only means anything together with
 * the figure that selects it, so both go through one fan-out. Null clears it.
 */
export function writePetPicture(dataUrl: string | null, storage?: PetFigureStorage | null): void {
  const target = storage === undefined ? defaultStorage() : storage;
  try {
    target?.setItem(PET_PICTURE_KEY, dataUrl ?? "");
  } catch {
    /* best-effort persistence (quota limits / private browsing) */
  }
  for (const listener of figureListeners) listener();
}
