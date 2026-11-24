/**
 * The window's own title bar, in the desktop shell — the strip the operating system used to draw.
 *
 * WHY THE PAGE DRAWS IT. The caption is the one strip of the window a theme can never reach: the
 * operating system draws it, in its own colours, whatever theme the app is wearing. So the shell
 * creates the window without one and keeps only the window controls over the page (see the
 * desktop package's title-bar.ts); this is the strip that stands in its place, above the
 * navigation column and the main column alike, because a caption belongs to the window and not to
 * a column.
 *
 * IT IS NOT ALWAYS THERE. Only the shell's own window gets one, and only when the shell says it
 * handed the caption over (`status.enabled`). A shell older than this change, and macOS, keep
 * their native caption — a strip drawn under those would be a second title bar below a real one.
 *
 * WHAT IT OWNS. The words (the window's title, read from the same live value the tab title is
 * written from), the surface behind the controls, and the drag handle — the caption is how a
 * window is moved, so the strip carries the drag region the frame used to provide. The controls
 * themselves are the window manager's and stay native: a page is not the only thing allowed to
 * close a window. Their colours, though, ARE ours to send, which is what the effect below does —
 * on load and on every theme change, because only a page can resolve a theme token to a colour.
 */
import { useEffect, useState } from "react";
import type { DesktopTitleBarStatus } from "@adelie/server/api";
import * as api from "../../api/endpoints";
import { isDesktopShellWindow } from "../../lib/account-menu";
import { S } from "../../lib/strings";
import { useWindowTitle } from "../../lib/use-document-title";
import { useAuth } from "../../state/auth";

/** The theme tokens the strip and the controls over it are painted from: the chrome surface, its ink. */
const SURFACE_TOKEN = "--ui-surface-muted";
const INK_TOKEN = "--ui-fg";

/**
 * The strip itself: the window's title on the theme's chrome surface, as tall as the caption it
 * replaced, and the window's drag handle (see `.ui-title-bar` in styles.css).
 */
export function DesktopTitleBar() {
  const { desktopMode, sessionVia } = useAuth();
  const inShell = isDesktopShellWindow({ desktopMode, sessionVia });
  const title = useWindowTitle();
  const [status, setStatus] = useState<DesktopTitleBarStatus | null>(null);

  useEffect(() => {
    if (!inShell) return;
    let live = true;
    void api.getDesktopTitleBar().then(
      (res) => {
        if (live) setStatus(res.status);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [inShell]);

  const enabled = inShell && status?.enabled === true;

  // The two colours the native controls are drawn with. Read off the live theme rather than
  // derived from an id: the same strip must paint the same colour under a shipped theme and an
  // imported one, and only the cascade knows which.
  const [colors, setColors] = useState<{ color: string; symbolColor: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const read = (): void => {
      const color = themeColor(SURFACE_TOKEN);
      const symbolColor = themeColor(INK_TOKEN);
      if (color === null || symbolColor === null) return;
      // Same object while the colours are unchanged: a mutation that moves nothing re-renders
      // nothing and relays nothing.
      setColors((prev) =>
        prev !== null && prev.color === color && prev.symbolColor === symbolColor
          ? prev
          : { color, symbolColor },
      );
    };
    read();
    // A theme change writes attributes on the root element — the class for dark, a `data-*` name
    // for the theme, the accent and the font choices, a style for the text size — and the pre-paint
    // script writes the same ones before the first frame. Every attribute is watched rather than a
    // list of them: the list is the theme layer's business, and a name spelled out here would be
    // one more place to keep in step with it.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || colors === null) return;
    void api.setDesktopTitleBar(colors).catch(() => {});
  }, [enabled, colors]);

  const height = status?.height ?? 0;
  if (!enabled) return null;
  return (
    // env(titlebar-area-height): the height the overlay gives the draggable area, so the strip is
    // exactly the caption's. The status height stands in where the variable is missing.
    <div
      className="ui-title-bar flex shrink-0 items-center bg-surface-muted"
      style={{ height: `env(titlebar-area-height, ${height}px)` }}
    >
      <span className="min-w-0 truncate px-3 text-xs font-medium text-fg-subtle">
        {title || S.appName}
      </span>
    </div>
  );
}

/**
 * A theme token's colour, as a plain sRGB string the shell's window controls can be painted with
 * — or null when the token resolves to nothing (no theme applied yet).
 *
 * Two steps, because a token's own value is neither of the things the overlay needs. As it sits on
 * the root element the value is whatever the theme declared: usually a `var()` chain ending in a
 * modern colour function (`oklch()`, from Tailwind's own palette), which the overlay's parser
 * refuses outright — the shell logs "Could not parse color as CSS color" and the controls keep
 * their default colours, the one thing this strip exists to prevent. So the token is resolved the
 * way CSS resolves it — an element wearing it, its computed colour read back, the chain collapsed
 * to one colour — and that colour is then painted into a one-pixel canvas and read back as bytes:
 * the canvas stores sRGB, so what comes out is a colour every platform's overlay accepts, whatever
 * the theme wrote and whichever colour space it wrote it in.
 */
function themeColor(token: string): string | null {
  if (getComputedStyle(document.documentElement).getPropertyValue(token).trim() === "") return null;
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  if (resolved === "" || !CSS.supports("color", resolved)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;
  ctx.fillStyle = resolved;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 255] = ctx.getImageData(0, 0, 1, 1).data;
  const hex = (n: number): string => n.toString(16).padStart(2, "0");
  return a === 255
    ? `#${hex(r)}${hex(g)}${hex(b)}`
    : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}
