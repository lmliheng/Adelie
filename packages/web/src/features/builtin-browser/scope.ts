/**
 * The conversation the built-in browser acts in, as the Web App's own scope.
 *
 * `browserScope()` is a real Session's id while a conversation is on screen, and the default
 * scope `""` everywhere else — a draft (whose Session does not exist yet), a page with no docks
 * (settings, login, the standalone terminal), a window showing no conversation. The panel, the
 * pages and every action read it, so one conversation's tabs, cookies and actions never reach
 * another's; the server keeps each scope's tab set and Chromium partition apart.
 *
 * The docks' scope is the route's conversation. A Session id always starts with `session-`
 * (chat-page.tsx `DRAFT_SESSION_ID` is `"new"`, a parked draft's route id starts with `draft-`,
 * and a page without docks sits on dock-state's `~none`), so anything else maps to the default
 * scope, which is also where a browser used before a conversation exists belongs.
 */
import { currentDockScope, docksOnScreen } from "../dock/dock-state";

/** The prefix every real Session id has (see the module doc). */
const SESSION_PREFIX = "session-";

export function browserScope(): string {
  if (!docksOnScreen()) return "";
  const scope = currentDockScope();
  return scope.startsWith(SESSION_PREFIX) ? scope : "";
}
