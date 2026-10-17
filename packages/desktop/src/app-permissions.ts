/**
 * What the App window's own session is allowed to ask the platform for. Pure decisions only —
 * the handlers that call them are installed in main.ts, because an Electron import cannot be
 * loaded by this package's vitest run.
 *
 * The App page is a plain browser on the default session, and Electron's permission handlers
 * are per session. Nothing installed one there, so a `notifications` check never settled: the
 * page's `Notification.permission` stayed "default" (the Preferences file carried no
 * notification grant), the task-completion notification's `permission === "granted"` gate
 * refused every time, and on Windows no toast was ever handed to the system (req-42).
 *
 * Notifications are therefore granted for the App's own origin — the one origin allowed to
 * navigate in this window is also the one allowed to notify — and nothing else changes: every
 * other permission keeps the answer this shell has always given (granted), so hardening one
 * permission cannot take away the page's clipboard, fullscreen or pointer lock. The built-in
 * browser's guests never reach this: they live on their own partition, with their own
 * handlers (builtin-browser.ts).
 */
import { isAppUrl } from "./util.js";

/** The one permission this module decides for itself. */
export const NOTIFICATIONS_PERMISSION = "notifications";

/**
 * Whether one permission check (or request) is granted. `requestingUrl` is the page that
 * asked — an origin for the check handler, a full URL for the request handler — and a
 * missing one counts as outside the App.
 */
export function grantsPermission(
  permission: string,
  requestingUrl: string,
  appOrigin: string | null,
): boolean {
  if (permission === NOTIFICATIONS_PERMISSION) return isAppUrl(requestingUrl, appOrigin);
  return true;
}
