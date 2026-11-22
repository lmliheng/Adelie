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
 *
 * `penguin` is the default and the drawing this page had before the choice existed, so a browser
 * that has never stored anything keeps the bird.
 *
 * READING IS SAFE BY CONSTRUCTION: anything that is not one of the names below — absent, an empty
 * string, a hand-edited value, a figure a later release dropped — is the default, and a storage
 * that refuses to be read (site data blocked, a partitioned iframe) answers the default too. As in
 * nav-group-collapse.ts, `localStorage` is resolved INSIDE the try rather than as a default
 * parameter, because merely touching it throws where site data is blocked and a `useState`
 * initializer (or a render) must not be taken down by it.
 */

/** The figures the pet can be, in the order the settings row offers them (the default first). */
export const PET_FIGURES = ["penguin", "whale"] as const;

/** One of the pet's drawings; features/pet/figures.ts maps each to the component that draws it. */
export type PetFigure = (typeof PET_FIGURES)[number];

/** What a browser that has never chosen gets: the penguin this page has always drawn. */
export const DEFAULT_PET_FIGURE: PetFigure = "penguin";

/** The key this preference is stored under (a `penguin.…` key; classified in install-scope.ts). */
export const PET_FIGURE_KEY = "penguin.petFigure";

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

/**
 * Follows the preference: for a renderer, and for another window of the app changing it. The
 * listener is told on every write in this window and on any `storage` event about the key; the
 * value itself is read with {@link readPetFigure}, so nothing is cached and the store can never
 * disagree with what is stored.
 */
export function subscribePetFigure(listener: () => void): () => void {
  figureListeners.add(listener);
  // A `storage` event only fires in OTHER documents of this origin — the companion window the
  // Settings row just changed. A null key is a `clear()`, which drops this preference too.
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== PET_FIGURE_KEY) return;
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
