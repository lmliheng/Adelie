/**
 * The desktop pet's window: which page it shows, how big it is, where it sits, and what it is
 * allowed to be. Pure — no Electron imports — so every decision here is unit-tested and main.ts
 * only has to create the window from it.
 *
 * The pet is a second window of the SAME app origin, showing a route of the Web App itself
 * (`/pet`). That is the whole reason it needs no preload, no IPC bridge and no separately served
 * page: the window is a plain browser like the main one, signed in by the same cookie, and it
 * learns everything it says over the same HTTP surface every other page reads.
 *
 * It is frameless, transparent and always on top, so the penguin appears to float on the desktop
 * rather than sit in a box; the page draws the fill and marks itself draggable. The window is NOT
 * click-through: its transparent corners still swallow a click that lands on them, which is why
 * the size below is kept as tight as the bubble and the pet together need. Drag from anywhere the
 * pet is not — the page opts its own controls out of the drag region.
 */
import path from "node:path";

/** The Web App route the pet window loads (see the Web App's router). */
export const PET_PAGE_PATH = "/pet";

/** The pet page's URL on a given app origin. */
export function petWindowUrl(origin: string): string {
  return `${origin}${PET_PAGE_PATH}`;
}

/**
 * Where the smoke run's screenshot of the pet window goes, given the one it was asked for: beside
 * the main window's, with `-pet` before the extension ("smoke.png" → "smoke-pet.png"). Parsed
 * rather than searched for a dot, so a directory in the path that has one (or a dotfile name) is
 * left alone — and the main window's shot is never the file that gets overwritten.
 */
export function petShotPath(mainShotPath: string): string {
  const { dir, name } = path.parse(mainShotPath);
  return path.join(dir, `${name}-pet.png`);
}

/**
 * The window's size. Small: the pet is a corner companion, and every pixel here is a pixel of
 * desktop it covers (see the click-through note above). Wide enough for the panel's longest line,
 * tall enough for that panel — three stacked rows and the hide action — with the penguin under it,
 * which is what the page is laid out to.
 */
export const PET_WINDOW_SIZE = { width: 260, height: 248 } as const;

/** A display's work area, in Electron's shape (excludes the taskbar/dock). */
export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Gap between the pet and the corner of the work area. */
export const PET_WINDOW_MARGIN = 24;

/**
 * Where a fresh pet window opens: the bottom-right corner of the work area, inset by
 * {@link PET_WINDOW_MARGIN}. The bottom right is where a desktop companion sits on every platform
 * — beside the clock, out of the way of the window a person is actually working in. It is a
 * starting position, not a policy: the window is movable and the shell puts it back here only
 * when the preference is switched on again during the same run.
 */
export function petWindowPosition(workArea: WorkArea): { x: number; y: number } {
  return {
    x: Math.round(workArea.x + workArea.width - PET_WINDOW_SIZE.width - PET_WINDOW_MARGIN),
    y: Math.round(workArea.y + workArea.height - PET_WINDOW_SIZE.height - PET_WINDOW_MARGIN),
  };
}

/**
 * What the pet window is, whatever anything else may want.
 *
 * - `frame: false` + `transparent: true` + `backgroundColor: "#00000000"` — the penguin floats;
 *   the page draws what fills the window, and the rest is empty desktop.
 * - `alwaysOnTop` — it is a companion, and one that hides behind the window you are working in
 *   would only be seen when it is useless.
 * - `skipTaskbar` — it is not a peer of the main window in the task list or the Dock, and
 *   `showInactive` keeps it from taking the focus when it appears.
 * - Not resizable, minimizable, maximizable or fullscreenable: it has one size and one purpose.
 * - The same webPreferences hardening as the main window and as every window this app opens: a
 *   plain browser, no Node, no preload, sandboxed. The pet page is ordinary app code, so it gets
 *   nothing the main window does not — including <webview>, which stays the main window's alone.
 */
export const PET_WINDOW_OPTIONS = {
  ...PET_WINDOW_SIZE,
  show: false,
  frame: false,
  transparent: true,
  backgroundColor: "#00000000",
  hasShadow: false,
  resizable: false,
  movable: true,
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  skipTaskbar: true,
  alwaysOnTop: true,
  autoHideMenuBar: true,
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
} as const;
