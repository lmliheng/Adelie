/**
 * The tray menu's own window: the document it draws, the size it takes and where it lands.
 * Pure — no Electron imports — so every decision here unit-tests under plain vitest, and
 * src/tray.ts only has to put the window on screen.
 *
 * Why a window at all: a native menu's rows belong to the operating system, which picks their
 * height, padding and font and scales them with the display. Electron's `MenuItem` exposes
 * nothing to change any of that, so a menu drawn tighter than Windows draws one has to be a page
 * of our own.
 *
 * The page touches no server: it loads a `data:` document baked here, so the shell can draw the
 * menu before boot has resolved an app origin, and it reaches the Web App nowhere. Its two
 * messages — its own measured size, then the entry that was picked — travel over the preload
 * bridge (src/tray-menu-preload.cjs) rather than through Node in the page, which keeps the same
 * sandboxed, context-isolated webPreferences as every other window this app opens.
 */
import fs from "node:fs";
import path from "node:path";
import type { TrayMenuItem } from "./tray-menu.js";

/**
 * A rectangle in the shape Electron's `screen` and `BrowserWindow.setBounds` speak, in device
 * independent pixels. Declared here rather than imported, the way pet-window.ts declares its
 * own, so this module depends on nothing.
 */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What the window is, whatever anything else may want.
 *
 * - Frameless and transparent, and the size here is only a placeholder: the window is resized to
 *   exactly the menu's rectangle as soon as the page has measured itself, and the rounded corners
 *   are the page's own rather than a window frame's.
 * - No shadow and no margin around the menu: a transparent corner still swallows a click that
 *   lands on it, so the window has to be as tight as the menu is (the pet window is sized for
 *   the same reason).
 * - `alwaysOnTop` — a menu belongs over the window it was opened from.
 * - The same webPreferences hardening as the main window and as every window this app opens: a
 *   plain browser, no Node, sandboxed. The one preload is what hands the two messages back.
 */
export const TRAY_MENU_WINDOW_OPTIONS = {
  width: 220,
  height: 140,
  show: false,
  frame: false,
  transparent: true,
  backgroundColor: "#00000000",
  hasShadow: false,
  resizable: false,
  movable: false,
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

/** The preload bridge, relative to the app directory; scripts/build-assets.mjs copies it to dist/. */
export const TRAY_MENU_PRELOAD_RELPATH = ["dist", "tray-menu-preload.cjs"];

/**
 * The bridge's path for an app directory, or null when the file is not there (a source run that
 * has not built the assets). A window without its bridge is a menu nothing answers in, so the
 * caller falls back to the native menu instead — see tray.ts.
 */
export function resolveTrayMenuPreload(appPath: string): string | null {
  const preloadPath = path.join(appPath, ...TRAY_MENU_PRELOAD_RELPATH);
  return fs.existsSync(preloadPath) ? preloadPath : null;
}

/**
 * The two channels the page and the shell talk over. Written here and again as literals in the
 * preload, which Electron loads as plain CJS and this package's bundler never sees; the unit
 * test reads the preload back and pins the two together.
 */
export const TRAY_MENU_CHANNELS = {
  /** The page's own measured size, before the window is shown. */
  size: "tray-menu:size",
  /** The entry that was clicked. */
  pick: "tray-menu:pick",
} as const;

/** The narrowest menu worth drawing — a report below this is a measurement that went wrong. */
export const TRAY_MENU_MIN_WIDTH = 140;

/** The largest size a report may ask for: a page gone wrong must not open a window over everything. */
export const TRAY_MENU_MAX_SIZE = { width: 480, height: 640 } as const;

/**
 * A size off the wire, or null when it is not one. What the page reports is its own word, and
 * everything downstream of it down to `setBounds` has to take a finite, sane rectangle.
 */
export function trayMenuSize(value: unknown): { width: number; height: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const { width, height } = value as { width?: unknown; height?: unknown };
  if (typeof width !== "number" || typeof height !== "number") return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 1 || height < 1) return null;
  return {
    width: Math.min(Math.max(Math.ceil(width), TRAY_MENU_MIN_WIDTH), TRAY_MENU_MAX_SIZE.width),
    height: Math.min(Math.ceil(height), TRAY_MENU_MAX_SIZE.height),
  };
}

/** The gap left between the tray icon and the menu. */
export const TRAY_MENU_ANCHOR_GAP = 6;

/**
 * Where the menu lands for a tray icon: its right edge against the icon's, above the icon when
 * the icon sits in the lower half of the work area and below it when it sits in the upper half —
 * which is what puts the menu on the desktop side of a taskbar on any of its four edges — and
 * then pushed back inside the work area, so a menu opened near an edge is still whole.
 */
export function placeTrayMenu(
  anchor: Rectangle,
  size: { width: number; height: number },
  workArea: Rectangle,
): Rectangle {
  const above = anchor.y + anchor.height / 2 >= workArea.y + workArea.height / 2;
  const y = above
    ? anchor.y - size.height - TRAY_MENU_ANCHOR_GAP
    : anchor.y + anchor.height + TRAY_MENU_ANCHOR_GAP;
  const x = anchor.x + anchor.width - size.width;
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - size.width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - size.height);
  return {
    x: Math.round(Math.min(Math.max(x, workArea.x), maxX)),
    y: Math.round(Math.min(Math.max(y, workArea.y), maxY)),
    width: size.width,
    height: size.height,
  };
}

/**
 * How the menu is painted. Small on purpose: the complaint a native menu earned was its size, so
 * a row is 26px and a label 13px where Windows draws roughly 32 and 14, with the padding, the
 * separators and the corners to match. The palette follows the system's light or dark appearance
 * — the class on `body` is the only difference between the two.
 */
const MENU_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: transparent; }
body {
  font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "PingFang SC",
    "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  font-size: 13px;
  line-height: 1.25;
  -webkit-user-select: none;
  user-select: none;
  cursor: default;
}
body.light {
  --bg: #fbfbfb;
  --fg: #1f1f1f;
  --hover: rgba(0, 0, 0, 0.055);
  --sep: rgba(0, 0, 0, 0.09);
  --border: rgba(0, 0, 0, 0.13);
}
body.dark {
  --bg: #2c2c2c;
  --fg: #f0f0f0;
  --hover: rgba(255, 255, 255, 0.09);
  --sep: rgba(255, 255, 255, 0.10);
  --border: rgba(255, 255, 255, 0.13);
}
#menu {
  width: max-content;
  min-width: 168px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg);
}
#menu:focus { outline: none; }
.item {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 0 8px;
  border-radius: 5px;
  white-space: nowrap;
}
.item:hover, .item:focus { background: var(--hover); outline: none; }
.check { flex: none; width: 11px; font-size: 11px; text-align: center; opacity: 0; }
.item[aria-checked="true"] .check { opacity: 1; }
.sep { height: 1px; margin: 4px 6px; background: var(--sep); }
`;

/**
 * The page's whole behaviour: measure the menu and report it, then report whichever entry was
 * clicked. Arrow keys and Enter walk and fire the entries, the way a native menu answers the
 * keyboard; Escape is the shell's (see tray.ts), so the menu still closes if this script never
 * got to run.
 */
const MENU_SCRIPT = `
(function () {
  var bridge = window.trayMenu;
  var menu = document.getElementById("menu");
  if (!bridge || !menu) return;
  var reported = false;
  function report() {
    if (reported) return;
    reported = true;
    var rect = menu.getBoundingClientRect();
    bridge.reportSize({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
  }
  requestAnimationFrame(report);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(report, report);
  menu.addEventListener("click", function (event) {
    var item = event.target.closest("[data-action]");
    if (item) bridge.pick(item.getAttribute("data-action"));
  });
  var items = Array.prototype.slice.call(menu.querySelectorAll("[data-action]"));
  var index = -1;
  window.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      if (event.key !== "Enter" && event.key !== " ") return;
      var current = document.activeElement;
      if (!current || !current.hasAttribute("data-action")) return;
      event.preventDefault();
      bridge.pick(current.getAttribute("data-action"));
      return;
    }
    event.preventDefault();
    if (items.length === 0) return;
    var step = event.key === "ArrowDown" ? 1 : -1;
    index = index < 0 ? (step === 1 ? 0 : items.length - 1) : (index + step + items.length) % items.length;
    items[index].focus();
  });
})();
`;

/** A menu label as text on the page: the labels are ours, but they are still text, not markup. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One entry of the document: a separator, or a row carrying the action the shell binds. */
function itemHtml(item: TrayMenuItem): string {
  if (item.type === "separator") return `<div class="sep" role="separator"></div>`;
  const checkbox = item.type === "checkbox";
  const checked = checkbox && item.checked === true;
  const attributes = [
    `class="item"`,
    `role="${checkbox ? "menuitemcheckbox" : "menuitem"}"`,
    `tabindex="-1"`,
    `data-action="${escapeHtml(item.action ?? "")}"`,
  ];
  // The check column is drawn on every row, empty on the ones that are not checkboxes, so the
  // labels of a menu with a checkbox in it still line up.
  if (checkbox) attributes.push(`aria-checked="${checked ? "true" : "false"}"`);
  return (
    `<div ${attributes.join(" ")}>` +
    `<span class="check" aria-hidden="true">✓</span>` +
    `<span class="label">${escapeHtml(item.label ?? "")}</span>` +
    `</div>`
  );
}

/** The document the menu window loads: the entries painted, and nothing else. */
export function trayMenuDocument(opts: { items: readonly TrayMenuItem[]; dark: boolean }): string {
  return [
    "<!doctype html>",
    `<html lang="en"><head><meta charset="utf-8">`,
    // A menu has no business loading anything; the inline style and script are all it needs.
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">`,
    `<style>${MENU_CSS}</style>`,
    `</head>`,
    `<body class="${opts.dark ? "dark" : "light"}">`,
    `<div id="menu" role="menu" tabindex="-1">${opts.items.map(itemHtml).join("")}</div>`,
    `<script>${MENU_SCRIPT}</script>`,
    `</body></html>`,
  ].join("");
}

/** The document as the URL the window loads: a `data:` page, so nothing has to be served. */
export function trayMenuDocumentUrl(document: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(document)}`;
}
