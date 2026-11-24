/**
 * The window's own title bar, handed to the page (pure decisions, no Electron imports; unit-tested).
 *
 * WHY THE SHELL TURNS IT OVER. The caption Windows draws is the operating system's, in the
 * operating system's colours: it is the one strip of the window a theme can never reach, and the
 * only part of the app that looks the same under every theme this install ships or imports. So the
 * window is created without a caption and the Web App paints one instead, in the theme's own
 * surface, above both columns.
 *
 * WHAT SURVIVES. Not everything on the caption is ours to redraw: minimise, maximise and close are
 * the window manager's, and a page cannot be trusted to be the only way to close a window. Electron
 * keeps them by drawing its own controls *over* the page — the Window Controls Overlay — while the
 * page paints everything under and around them. The shell sets the overlay's two colours; the page
 * owns the height, the background and the words.
 *
 * WHERE. `titleBarOverlay` is supported on Windows and Linux. On macOS the caption is the traffic
 * lights' own strip and the shell leaves it alone (a release that ships no macOS build should not
 * be the first place a mac window loses its frame), so the page is told to draw nothing there.
 *
 * THE TRADE. A page that draws nothing would leave a frameless window with no way to drag it — the
 * caption is the drag handle. The packaged app carries the Web App inside it, so the two ship
 * together and the strip is always there; a shell older than this change keeps its native caption
 * and is never asked for one, because it never sends the status below.
 */
import type {
  DesktopTitleBarCommandMessage,
  DesktopTitleBarStatusMessage,
} from "@adelie/server/api";

/**
 * The strip's height in CSS pixels. 32 is what Windows gives its own caption at every display
 * scaling (the caption is measured in DIPs), so the strip sits exactly where the native one did.
 */
export const TITLE_BAR_HEIGHT = 32;

/**
 * Whether this platform can hand the caption over: the Window Controls Overlay exists on Windows
 * and Linux only. Everywhere else the shell keeps the frame it has always had.
 */
export function supportsTitleBarOverlay(platform: NodeJS.Platform): boolean {
  return platform === "win32" || platform === "linux";
}

/** The `BrowserWindow` options that turn the caption over, or none where the platform keeps it. */
export function titleBarWindowOptions(
  platform: NodeJS.Platform,
): { titleBarStyle: "hidden"; titleBarOverlay: { height: number } } | Record<string, never> {
  if (!supportsTitleBarOverlay(platform)) return {};
  return { titleBarStyle: "hidden", titleBarOverlay: { height: TITLE_BAR_HEIGHT } };
}

/** What the shell tells the page about the caption: whether it draws one, and how tall it is. */
export function titleBarStatusMessage(platform: NodeJS.Platform): DesktopTitleBarStatusMessage {
  return {
    type: "desktop-titlebar-status",
    status: { enabled: supportsTitleBarOverlay(platform), height: TITLE_BAR_HEIGHT },
  };
}

/**
 * What one relayed command asks the shell to change: the two colours the native controls are drawn
 * with. Both are the page's to know and neither is the shell's to guess — the strip's own
 * background is a theme token, and the symbols' ink is its companion.
 */
export interface TitleBarCommand {
  color?: string;
  symbolColor?: string;
}

/** Parses one relayed command; null when the frame is not one. Colour strings are passed through. */
export function parseTitleBarCommand(data: unknown): TitleBarCommand | null {
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Partial<DesktopTitleBarCommandMessage>;
  if (msg.type !== "desktop-titlebar-command") return null;
  const patch: TitleBarCommand = {};
  if (typeof msg.color === "string") patch.color = msg.color;
  if (typeof msg.symbolColor === "string") patch.symbolColor = msg.symbolColor;
  return patch;
}

/** Applies a parsed command to a window's overlay, dropping what the command did not carry. */
export function overlayOptionsFor(
  command: TitleBarCommand,
): { color?: string; symbolColor?: string } | null {
  if (command.color === undefined && command.symbolColor === undefined) return null;
  return {
    ...(command.color !== undefined ? { color: command.color } : {}),
    ...(command.symbolColor !== undefined ? { symbolColor: command.symbolColor } : {}),
  };
}
