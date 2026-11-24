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
 * the size below is kept as tight as the panel and the pet together need. Drag from anywhere the
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
 * tall enough for that panel — the four stacked rows and the hide action — with the pet under it,
 * which is what the page is laid out to.
 *
 * The height is the panel's own, measured against the built stylesheet at this width: 197px, and
 * 212px in English, where the call row's line wraps to a second line. Above that are the 4px gap
 * and the 72px pet the page puts under it, plus its own 8px padding: 300 leaves the panel a few
 * pixels of air and the call row's promise ("点「打电话」，对着麦克风聊天。") fully drawn. It sat at
 * 248 for as long as the panel had three rows — the voice-call row made it four, and from then on
 * the window cut the panel's first row in half, because `justify-end` sends the overflow up and
 * `overflow-hidden` hides it. The page also caps its own panel at the room left over, so a longer
 * notice scrolls rather than disappearing behind the window's top edge.
 */
export const PET_WINDOW_SIZE = { width: 260, height: 300 } as const;

/**
 * The size the window takes while a call is open. A call is a surface, not a corner companion: the
 * stage shows the other side's state, the transcript of both speakers and the microphone's level,
 * which needs a column rather than the resting window's three tight rows. The window is grown for
 * as long as the call lasts and returned to {@link PET_WINDOW_SIZE} the moment it ends, so the
 * desktop is covered only while someone is actually talking to it.
 */
export const PET_CALL_WINDOW_SIZE = { width: 320, height: 420 } as const;

/** The size a pet window takes: resting, or the call's stage while one is open. */
export function petWindowSize(showCall: boolean): {
  width: number;
  height: number;
} {
  return showCall ? PET_CALL_WINDOW_SIZE : PET_WINDOW_SIZE;
}

/** A window's rectangle, in Electron's shape. */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The rectangle a pet window takes when it changes size in place: the new size, positioned so the
 * window's bottom-right corner — the one anchored to the desktop's corner — does not move, then
 * pushed back inside the work area. Growing from the anchored corner is what keeps the pet where
 * the user left it; clamping is the case where the window sits near an edge of a smaller display
 * and the new size would otherwise put the bottom off it.
 */
export function petResizedBounds(
  current: Rectangle,
  size: { width: number; height: number },
  workArea: WorkArea,
): Rectangle {
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - size.width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - size.height);
  const x = Math.min(Math.max(current.x + current.width - size.width, workArea.x), maxX);
  const y = Math.min(Math.max(current.y + current.height - size.height, workArea.y), maxY);
  return { x: Math.round(x), y: Math.round(y), width: size.width, height: size.height };
}

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
export function petWindowPosition(
  workArea: WorkArea,
  size: { width: number; height: number } = PET_WINDOW_SIZE,
): { x: number; y: number } {
  return {
    x: Math.round(workArea.x + workArea.width - size.width - PET_WINDOW_MARGIN),
    y: Math.round(workArea.y + workArea.height - size.height - PET_WINDOW_MARGIN),
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
