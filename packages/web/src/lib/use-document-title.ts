/**
 * Sync the browser tab title (document.title): "{title} · Adelie"
 * when a page title is set, falling back to the app name otherwise. Called
 * at the top level of each page component, updating instantly on route
 * changes or title changes (e.g. an auto-generated Session title delivered
 * via a session_title event).
 *
 * The same string is what the desktop shell's own title bar draws (see
 * components/layout/desktop-title-bar.tsx): the caption is the page's there, so the words that
 * used to be the operating system's to render are read back out of here. They travel as a live
 * value rather than being re-derived, because the strip must say exactly what a window's title
 * says — one title, written once, whatever draws it.
 */
import { useEffect, useSyncExternalStore } from "react";
import { S } from "./strings";

/** The renderers following the window's title (the desktop shell's strip). */
const listeners = new Set<() => void>();
let windowTitle = "";

function setWindowTitle(next: string): void {
  if (next === windowTitle) return;
  windowTitle = next;
  for (const listener of listeners) listener();
}

export function useDocumentTitle(title: string | null | undefined): void {
  const text = title ? `${title} · ${S.appName}` : S.appName;
  useEffect(() => {
    document.title = text;
    setWindowTitle(text);
  }, [text]);
}

/**
 * The window's title as a live value, for the strip that draws it in the desktop shell. Empty
 * until the first page sets one, which a caller renders as the app name — and correct in a plain
 * browser too, where nothing draws it.
 */
export function useWindowTitle(): string {
  return useSyncExternalStore(subscribeWindowTitle, readWindowTitle, readWindowTitle);
}

function subscribeWindowTitle(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readWindowTitle(): string {
  return windowTitle;
}
