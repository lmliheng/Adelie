/**
 * Creating a shell from the dock's EMPTY picker (features/dock/dock-terminal.ts).
 *
 * The picker's terminal row is a surface that asked for the shell, and a create that fails
 * leaves that picker exactly as it was — so the sentence belongs under the row (dock-panel
 * draws it) instead of a notice that dismisses itself six seconds after a click that seemed
 * to do nothing. The picker's sentence must not swallow the toast for the callers that have
 * no such surface (+ over a running tab, the toggle with the dock hidden), and it must go
 * away the moment a later attempt lands.
 *
 * What is pinned here is the module store: which attempt writes a sentence, which attempt
 * does not, and that the toast keeps the cases the picker cannot carry.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { toastStore } from "@adelie/ui";
import { memoryStorage } from "./helpers/storage";
import { apiError, json, stubFetch } from "./helpers/fetch";

let dock: typeof import("../src/features/dock/dock-state");
let terminal: typeof import("../src/features/dock/dock-terminal");

beforeAll(async () => {
  // Not vi.stubGlobal: the package config unstubs globals before every test, and the dock
  // store (imported here, which reads it at import time) has to keep this one for the file.
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  dock = await import("../src/features/dock/dock-state");
  terminal = await import("../src/features/dock/dock-terminal");
});

let scopeSeq = 0;
/** A fresh conversation scope per test — scopes are the isolation boundary. */
beforeEach(() => {
  scopeSeq += 1;
  dock.setDockScope(`test-create-refusal-${scopeSeq}`);
  // The stack is a module store and outlives a test: an earlier test's toasts are not this
  // one's evidence.
  toastStore.setState({ items: [] });
});

/** The server's refusal as a failed spawn arrives: a 500 whose body names the reason. */
function spawnFailure(): Response {
  return apiError(
    500,
    "terminal_spawn_failed",
    "Could not start a shell: posix_spawn failed (mock)",
  );
}

describe("a shell create the server refused", () => {
  it("keeps its sentence under the empty dock's picker and draws no toast", async () => {
    // The picker is what an open, empty dock shows — and what the terminal row is pressed in.
    dock.toggleDock("bottom");
    expect(dock.dockViews().some((view) => view.tabs.length === 0)).toBe(true);
    const fake = stubFetch((request) =>
      request.method === "POST" ? spawnFailure() : json({ terminals: [] }),
    );

    await terminal.createShellInDock("bottom");

    // The sentence the panel draws: ours, with the server's own words — the body's
    // `error.message`, not the wire line with the JSON still in it.
    expect(terminal.readTerminalCreateRefusal()).toBe(
      "无法打开终端：Could not start a shell: posix_spawn failed (mock)",
    );
    // No tab was created, so the picker is still what the reader faces.
    expect(dock.dockTabs("bottom")).toHaveLength(0);
    // ... and the reason is not ALSO a notice that would dismiss itself.
    expect(toastStore.getState().items).toEqual([]);
    expect(fake.requests.filter((r) => r.method === "POST").map((r) => r.path)).toEqual([
      "/api/terminals",
    ]);
  });

  it("a new attempt replaces the sentence, and a create that lands clears it", async () => {
    dock.toggleDock("bottom");
    stubFetch((request) => (request.method === "POST" ? spawnFailure() : json({ terminals: [] })));
    await terminal.createShellInDock("bottom");
    expect(terminal.readTerminalCreateRefusal()).not.toBeNull();

    // The server recovers: the next create starts a real shell and the old sentence goes.
    stubFetch((request) =>
      request.method === "POST"
        ? json({ id: "term-recovered", name: "shell", cwd: "/root", alive: true })
        : json({ terminals: [] }),
    );
    await terminal.createShellInDock("bottom");

    expect(terminal.readTerminalCreateRefusal()).toBeNull();
    expect(dock.dockTabs("bottom").map(dock.tabKey)).toEqual(["terminal:term-recovered"]);
  });

  it("still goes to the toast when the dock already holds a tab — no picker, no place of its own", async () => {
    // A "+" over a running tab: the dock has something on screen that the click did not come
    // from, so the sentence has nowhere of its own to stay.
    dock.addTerminalTab("term-live");
    expect(dock.dockViews().every((view) => view.tabs.length > 0)).toBe(true);
    stubFetch((request) => (request.method === "POST" ? spawnFailure() : json({ terminals: [] })));

    await terminal.createShellInDock("bottom");

    expect(terminal.readTerminalCreateRefusal()).toBeNull();
    const toasts = toastStore.getState().items.map((item) => item.text);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toContain("终端创建失败");
    expect(toasts[0]).toContain("posix_spawn failed (mock)");
  });
});

describe("the words of a refused create", () => {
  it("says the server's own message from an API refusal's body", () => {
    expect(
      terminal.terminalCreateRefused(
        'POST /api/terminals → 500 {"error":{"code":"terminal_spawn_failed","message":"Could not start a shell: posix_spawn failed (mock)"}}',
      ),
    ).toBe("无法打开终端：Could not start a shell: posix_spawn failed (mock)");
    // The flat shape a reverse proxy or an older route may answer with.
    expect(terminal.terminalCreateRefused('POST /api/terminals → 400 {"message":"bad cwd"}')).toBe(
      "无法打开终端：bad cwd",
    );
  });

  it("keeps the whole detail when the body is not that shape", () => {
    // A dropped connection: no body at all, and the words are the app's own.
    expect(terminal.terminalCreateRefused("Failed to fetch")).toBe("无法打开终端：Failed to fetch");
    // An HTML error page: `{` is there but what follows is not JSON.
    expect(
      terminal.terminalCreateRefused("GET /api/terminals → 502 <html>bad gateway</html>"),
    ).toBe("无法打开终端：GET /api/terminals → 502 <html>bad gateway</html>");
    // JSON without a message worth showing: the wire line stays, it is all there is.
    expect(terminal.terminalCreateRefused('POST /api/terminals → 500 {"code":"x"}')).toBe(
      '无法打开终端：POST /api/terminals → 500 {"code":"x"}',
    );
  });
});
