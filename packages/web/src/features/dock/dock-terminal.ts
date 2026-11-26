/**
 * The dock's terminal-side helpers: creating/adopting shells for terminal tabs, and the
 * global `terminal.toggle` command. Split from dock-state.ts so the store stays pure (unit-testable
 * without fetch); this module owns every server round-trip a terminal tab needs.
 */
import { toastError } from "@adelie/ui";
import { S } from "../../lib/strings";
import { onCommand } from "../../lib/shortcuts/dispatcher";
import {
  HttpStatusError,
  fetchJson,
  probeJson,
  type TerminalInfo,
} from "../terminal/terminal-view";
import { liveTerminals, noteTerminalCreated, refreshTerminals } from "../terminal/terminal-list";
import { machineForTerminal, rememberTerminalMachine } from "../../lib/terminal-machines";
import {
  addTerminalTab,
  currentDockScope,
  dockViews,
  docksOnScreen,
  removeTab,
  restoreTerminalTab,
  showTerminal,
  toggleDock,
  toggleTerminalDocks,
  unownedTerminals,
  type DockPosition,
} from "./dock-state";

/** Where a new shell starts when no Workspace is known: the user's home directory. */
const HOME_CWD = "~";

/**
 * The Workspace a new shell should start in — the conversation's own directory, which is
 * where its files are and what the agent has been working in. Published by the surface
 * that knows it (the chat page for a Session, the draft page for the Workspace picked
 * there) rather than read from a store, because the terminal toggle creates shells from a
 * module-scope command handler with no React context to consult. Null = none known; the shell
 * falls back to home.
 */
let workspaceCwd: string | null = null;
/**
 * And the machine that directory is ON. A Workspace path is only meaningful on its own
 * filesystem, so the machine travels with it — the same pairing every other Workspace
 * carries in this feature. Null = this server.
 */
let workspaceMachine: string | null = null;

/**
 * Points new shells at this absolute Workspace path, on `machineId`; null path restores the
 * home default. A shell for a conversation that lives on a machine has to be a pty on THAT
 * machine: the files it is for are there, and the agent it sits beside is there.
 */
export function setDockCwd(path: string | null, machineId: string | null = null): void {
  workspaceCwd = path !== null && path.trim() !== "" ? path : null;
  workspaceMachine = workspaceCwd === null ? null : machineId;
}

/**
 * The Workspace the page's docks belong to — the conversation's, or the one the draft picked —
 * with its machine; null when none is known. Only meaningful while a page with docks is on
 * screen (`docksOnScreen`): elsewhere it still names the last conversation's, for the hotkey.
 */
export function dockWorkspace(): { path: string; machineId: string | null } | null {
  return workspaceCwd === null ? null : { path: workspaceCwd, machineId: workspaceMachine };
}

/** A rejected working directory (gone, replaced by a file, relative) — see resolveCwd server-side. */
function isBadCwd(err: unknown): boolean {
  return err instanceof HttpStatusError && err.status === 400 && err.message.includes("cwd_not_");
}

/**
 * The sentence a failed create left where the dock's picker draws it, or null.
 *
 * The picker's terminal row is a surface that ASKED for the shell, and a create that fails
 * leaves that picker exactly as it was — same row, same place. So the sentence belongs under
 * it, where it stays until the next attempt, rather than in a notice that dismisses itself
 * six seconds after a click that looked like it did nothing (the rule every refusal slot in
 * the app follows). Module-level because the create is raised from places with no React
 * context: the picker's own row, the terminal.toggle command, the sidebar's menu.
 *
 * Only the empty dock writes here (see pickerOnScreen): a "+" over an existing tab has no
 * surface of its own, and its failure keeps going to the toast it always had.
 */
let createRefusal: string | null = null;
const createRefusalListeners = new Set<() => void>();

/** Subscribed by the dock panel, through useSyncExternalStore. */
export function subscribeTerminalCreateRefusal(listener: () => void): () => void {
  createRefusalListeners.add(listener);
  return () => {
    createRefusalListeners.delete(listener);
  };
}

/** The sentence the picker is to draw; null when the last create landed or was never refused. */
export function readTerminalCreateRefusal(): string | null {
  return createRefusal;
}

/**
 * Drops the sentence. A new attempt replaces it (its answer is the one that describes the
 * screen), and the picker leaving the screen retires it: it described a click made from
 * there, so it must not turn up again on a later, unrelated one.
 */
export function clearTerminalCreateRefusal(): void {
  if (createRefusal === null) return;
  createRefusal = null;
  for (const listener of createRefusalListeners) listener();
}

function setCreateRefusal(text: string): void {
  createRefusal = text;
  for (const listener of createRefusalListeners) listener();
}

/**
 * The line a refused create is reported with, built from the failure's own detail
 * ("POST /api/terminals → 500 {"error":{"code":…,"message":…}}", see HttpStatusError).
 *
 * The picker's sentence stays on screen until the next attempt, so it carries the server's
 * reason and not the wire truth: the message inside the body when there is one (every API
 * refusal has `error.message`), and the whole detail when the body is not that shape (an
 * HTML error page, a dropped connection). Exported for its own test.
 */
export function terminalCreateRefused(detail: string): string {
  const body = detail.slice(detail.indexOf("{"));
  if (body.startsWith("{")) {
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: unknown };
        message?: unknown;
      };
      const message = parsed.error?.message ?? parsed.message;
      if (typeof message === "string" && message.trim() !== "") {
        return S.terminal.createRefused(message.trim());
      }
    } catch {
      // Not JSON after all (a proxy's HTML page, half a body): the detail as it came.
    }
  }
  return S.terminal.createRefused(detail);
}

/**
 * Whether an empty dock — the picker — is on screen right now: exactly the views
 * dockViews() lists with no tabs (one open dock with no tabs draws its picker).
 */
function pickerOnScreen(): boolean {
  return dockViews().some((view) => view.tabs.length === 0);
}

/**
 * Creates a fresh shell and tabs it into `position` (the bottom dock by default). The
 * shell starts in the current Workspace; a Workspace the server rejects (deleted since,
 * or a path this server cannot see) falls back to home rather than leaving the user with
 * no terminal at all.
 * Failures surface where the click came from: the empty dock's picker keeps the sentence
 * under its terminal row, and any other caller (a "+" over a running tab, the toggle with
 * the dock hidden) still gets the toast — with no tab created there is no surface of its
 * own to carry the error, and a swallowed create looks like nothing happened, which is
 * exactly how a server-side spawn failure used to present.
 */
export async function createShellInDock(position?: DockPosition): Promise<void> {
  // The machine is named explicitly: there is no terminal id yet for the routing rule to
  // read, which is the one call in this feature that cannot use it.
  const machine = workspaceMachine;
  // This attempt's answer is the one that describes the screen: the last attempt's sentence
  // was about another try, possibly another shape of failure.
  clearTerminalCreateRefusal();
  const create = (cwd: string): Promise<TerminalInfo> =>
    fetchJson<TerminalInfo>(
      "/api/terminals",
      { method: "POST", body: JSON.stringify({ cwd }) },
      machine,
    );
  try {
    let created: TerminalInfo;
    try {
      created = await create(workspaceCwd ?? HOME_CWD);
    } catch (err) {
      if (workspaceCwd === null || !isBadCwd(err)) throw err;
      console.warn(`[terminal] Workspace unusable as cwd, opening in ${HOME_CWD}:`, err);
      // Home is still home ON THAT MACHINE: a Workspace that has gone is no reason to put
      // the shell on a different computer from the conversation it belongs to.
      created = await create(HOME_CWD);
    }
    rememberTerminalMachine(created.id, machine);
    noteTerminalCreated(created);
    addTerminalTab(created.id, position);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A 404 here is not "this terminal is gone" — the endpoint itself is absent, which
    // means the server answering is older than the terminal API (the desktop shell also
    // attaches to an already-running server rather than starting its own).
    const detail =
      err instanceof HttpStatusError && err.status === 404
        ? `${message} — ${S.terminal.noTerminalApi}`
        : message;
    console.error("[terminal] create failed:", detail);
    if (pickerOnScreen()) {
      // The picker is the surface that asked: its row is still there to press again, so the
      // sentence stays under it (dock-panel) instead of dismissing itself in six seconds.
      setCreateRefusal(terminalCreateRefused(detail));
    } else {
      toastError(`${S.terminal.createFailed}: ${detail}`);
    }
  } finally {
    void refreshTerminals();
  }
}

/**
 * Puts a terminal on screen in `position` (or the bottom dock): the newest live shell no
 * conversation holds is adopted — one started through the API or the CLI, or whose tab
 * was closed — rather than answered with a second shell running beside it; only when
 * every live shell is already tabbed somewhere (or none exists) is a new one created.
 */
export async function openTerminalInDock(position?: DockPosition): Promise<void> {
  // Through the list, not a bare fetch of this server's collection: a terminal is a pty on
  // ONE machine, and `/api/terminals` asked without a machine answers for this one alone —
  // so a conversation on a machine would never find the shell it already has there, and
  // would spawn a second one beside it on every open.
  await refreshTerminals();
  const live = liveTerminals().filter((t) => t.alive);
  // And it has to be a shell on the machine this conversation's files are on, for the same
  // reason createShellInDock creates one there.
  const here = live.filter((t) => machineForTerminal(t.id) === workspaceMachine);
  const adoptable = unownedTerminals(here.map((t) => t.id)).at(-1);
  if (adoptable !== undefined) {
    addTerminalTab(adoptable, position);
    return;
  }
  await createShellInDock(position);
}

/**
 * Detach a terminal to its own /terminal window, and RETURN it when that window closes:
 * the tab leaves the strip while the shell lives in the window, and closing the window
 * puts the tab back into the conversation and dock it left — even if the user is looking
 * at another conversation by then. There is no cross-window close event, so a slow poll
 * on the handle's `closed` flag watches for it; the restore is skipped when the shell
 * ended inside the window or the user already pulled it back in through a "+" menu.
 * (The handle is why the window is NOT opened with "noopener" — window.open would then
 * return null; the target is this same app's own page.)
 */
export function detachTerminal(id: string, position: DockPosition): void {
  const fromScope = currentDockScope();
  // The machine travels in the URL: the new window starts with an empty terminal map, so
  // without it a detached remote pane would try to attach to a pty on the wrong computer.
  const machine = machineForTerminal(id);
  const popup = window.open(
    `/terminal?id=${encodeURIComponent(id)}` +
      (machine === null ? "" : `&machine=${encodeURIComponent(machine)}`),
    "_blank",
  );
  removeTab(`terminal:${id}`);
  if (!popup) return; // blocked popup: the shell stays reachable from the "+" menus
  const timer = window.setInterval(() => {
    if (!popup.closed) return;
    window.clearInterval(timer);
    void (async () => {
      const info = await probeJson<TerminalInfo>(`/api/terminals/${encodeURIComponent(id)}`).catch(
        () => null,
      );
      if (info?.alive !== true) return; // the shell ended in the window: nothing to restore
      restoreTerminalTab(fromScope, id, position);
      void refreshTerminals();
    })();
  }, 600);
}

/**
 * The terminal toggle: hide the shown terminals, or bring them back — and with no terminal
 * tab in this conversation, adopt or create a shell (the async tail the store's synchronous
 * toggle hands off).
 */
export function toggleTerminal(): void {
  if (!toggleTerminalDocks()) void openTerminalInDock();
}

/** Re-exported for callers that already know which shell they want on screen. */
export { showTerminal };

// `terminal.toggle` (Ctrl+` on every platform by default — the Codex/VS Code binding),
// registered at module scope: a React-effect registration leaves a window after first paint
// where the shortcut is silently dead — an effect runs after paint, and a keypress can land
// in between. The store is page-global anyway; on routes without the docks (login,
// /terminal) the toggle just flips hidden state. The chord itself is the keymap's: the
// window dispatcher matches it and calls this handler.
onCommand("terminal.toggle", () => {
  toggleTerminal();
});
// The other dock commands live here for the same reason: the store (dock-state.ts) stays
// free of the dispatcher, and this module is evaluated wherever the docks can appear. Each
// declines on a page without docks (the browser's own key then runs): a toggle there would
// flip nothing visible, and a new terminal would spawn a server shell into the placeholder
// arrangement the next conversation inherits.
onCommand("terminal.new", () => {
  if (!docksOnScreen()) return false;
  void createShellInDock();
});
onCommand("dock.toggleRight", () => {
  if (!docksOnScreen()) return false;
  toggleDock("right");
});
onCommand("dock.toggleBottom", () => {
  if (!docksOnScreen()) return false;
  toggleDock("bottom");
});
