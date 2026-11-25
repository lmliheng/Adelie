/**
 * The built-in browser's state in a window (features/builtin-browser/browser-state.ts): the
 * server's per-conversation tab registries, the pages this window hosts, the agent's activity,
 * the homepage and the browser's load — driven by the user channel's five events and the
 * window's own actions (claim, close, activate, settings read or saved, a new tab asked for) —
 * and the rule that keeps a tab open while the panel is on screen. Two conversations of the same
 * window keep their tabs, active pointers and closings apart.
 */
import { describe, expect, it } from "vitest";
import type {
  BuiltinBrowserMetrics,
  BuiltinBrowserServerEvent,
  BuiltinBrowserTab,
} from "@adelie/server/api";
import {
  INITIAL_BROWSER_STATE,
  activeTab,
  activeTabIdInScope,
  addressOf,
  browserOffered,
  currentActivity,
  guestByKey,
  guestForTab,
  guestKey,
  reduceBrowser,
  shouldReveal,
  tabBusy,
  tabsInScope,
  wantsNewTabPage,
  type BrowserAction,
  type BrowserState,
} from "../src/features/builtin-browser/browser-state";

function tab(id: number, over: Partial<BuiltinBrowserTab> = {}): BuiltinBrowserTab {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Page ${id}`,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    ...over,
  };
}

function run(state: BrowserState, ...actions: BrowserAction[]): BrowserState {
  return actions.reduce(reduceBrowser, state);
}

const event = (e: BuiltinBrowserServerEvent): BrowserAction => ({ type: "event", event: e });

const open = (
  requestId: string,
  over: Partial<{ url: string; activate: boolean; sessionId: string; partition: string }> = {},
) =>
  event({
    type: "builtin_browser_open",
    requestId,
    url: over.url ?? "https://example.com/",
    activate: over.activate ?? true,
    partition: over.partition ?? "persist:penguin-browser",
    ...(over.sessionId !== undefined ? { sessionId: over.sessionId } : {}),
  });

/** A tabs event of one conversation (`scope` absent = the default scope). */
const listed = (tabs: BuiltinBrowserTab[], scope?: string): BrowserAction =>
  event({
    type: "builtin_browser_tabs",
    tabs,
    activeTabId: tabs.at(-1)?.id ?? null,
    ...(scope !== undefined ? { sessionId: scope } : {}),
  });

/** A status read (of the default scope unless one is named). */
const status = (
  over: Partial<{
    tabs: BuiltinBrowserTab[];
    activeTabId: number | null;
    reason: "shell_unsupported";
  }>,
  scope = "",
): BrowserAction => ({
  type: "status",
  scope,
  status: {
    available: over.reason === undefined,
    ...(over.reason !== undefined ? { reason: over.reason } : {}),
    tabs: over.tabs ?? [],
    activeTabId: over.activeTabId ?? null,
  },
});

/** A desktop window whose server said the browser is available, with no tabs yet. */
const READY = run(INITIAL_BROWSER_STATE, { type: "supported", supported: true }, status({}));

describe("availability", () => {
  it("offers the browser only where it can be hosted and the server can drive it", () => {
    expect(browserOffered(INITIAL_BROWSER_STATE)).toBe(false);
    expect(browserOffered(READY)).toBe(true);
    const shellTooOld = reduceBrowser(READY, status({ reason: "shell_unsupported" }));
    expect(browserOffered(shellTooOld)).toBe(false);
    expect(shellTooOld.reason).toBe("shell_unsupported");
    // A plain browser tab: the server may be fine, but there is no <webview> here.
    const noWebview = reduceBrowser(INITIAL_BROWSER_STATE, status({}));
    expect(browserOffered(noWebview)).toBe(false);
  });

  it("stops offering it when the status is refused", () => {
    expect(browserOffered(reduceBrowser(READY, { type: "unreachable" }))).toBe(false);
  });

  it("takes the registry of the conversation the status was read for", () => {
    const state = reduceBrowser(READY, status({ tabs: [tab(3), tab(5)], activeTabId: 5 }));
    expect(tabsInScope(state).map((t) => t.id)).toEqual([3, 5]);
    expect(activeTab(state)?.id).toBe(5);
    // The same read for a conversation leaves the default scope's tabs alone.
    const scoped = reduceBrowser(state, status({ tabs: [tab(9)], activeTabId: 9 }, "s1"));
    expect(tabsInScope(scoped).map((t) => t.id)).toEqual([3, 5]);
    expect(tabsInScope(scoped, "s1").map((t) => t.id)).toEqual([9]);
  });
});

describe("pages this window hosts", () => {
  it("creates a page for an open request, keyed by the request, in its conversation's partition", () => {
    const state = run(READY, open("r1", { url: "https://amazon.com/" }));
    expect(state.guests).toEqual([
      {
        key: guestKey("r1"),
        src: "https://amazon.com/",
        partition: "persist:penguin-browser",
        scope: "",
        requestId: "r1",
        tabId: null,
        activate: true,
      },
    ]);
  });

  it("keeps a conversation's page in that conversation's scope and partition", () => {
    const state = run(
      READY,
      open("r1", { sessionId: "s1", partition: "persist:penguin-browser:s1" }),
    );
    expect(state.guests[0]?.scope).toBe("s1");
    expect(state.guests[0]?.partition).toBe("persist:penguin-browser:s1");
  });

  it("starts a page asked for with no address on the blank page", () => {
    expect(run(READY, open("r1", { url: "" })).guests[0]?.src).toBe("about:blank");
  });

  it("creates one page per request, however often the event arrives", () => {
    expect(run(READY, open("r1"), open("r1")).guests).toHaveLength(1);
  });

  it("creates nothing in a window that cannot host a page", () => {
    const plain = { ...READY, supported: false };
    expect(run(plain, open("r1")).guests).toEqual([]);
  });

  it("only ever appends pages, so none is moved in the DOM", () => {
    const state = run(READY, open("a"), open("b"), open("c"));
    expect(state.guests.map((g) => g.requestId)).toEqual(["a", "b", "c"]);
    const afterClose = run(
      state,
      { type: "attached", key: guestKey("b"), tabId: 12 },
      { type: "closed", tabId: 12 },
      open("d"),
    );
    expect(afterClose.guests.map((g) => g.requestId)).toEqual(["a", "c", "d"]);
  });

  it("learns a page's tab id once, and gives one tab id to one page", () => {
    const state = run(
      READY,
      open("a"),
      open("b"),
      { type: "attached", key: guestKey("a"), tabId: 7 },
      { type: "attached", key: guestKey("a"), tabId: 99 },
      { type: "attached", key: guestKey("b"), tabId: 7 },
    );
    expect(guestByKey(state, guestKey("a"))?.tabId).toBe(7);
    expect(guestByKey(state, guestKey("b"))?.tabId).toBeNull();
    expect(guestForTab(state, 7)?.requestId).toBe("a");
    expect(guestForTab(state, null)).toBeNull();
  });

  it("drops its copy when another window claimed the request first", () => {
    const state = run(READY, open("a"), { type: "rejected", key: guestKey("a") });
    expect(state.guests).toEqual([]);
  });

  it("forgets every page when it stops hosting (signing out unmounts the layer)", () => {
    const state = run(READY, open("a"), { type: "supported", supported: false });
    expect(state.guests).toEqual([]);
  });
});

describe("tabs and closing", () => {
  const withTabs = run(
    READY,
    open("a"),
    { type: "attached", key: guestKey("a"), tabId: 1 },
    open("b"),
    { type: "attached", key: guestKey("b"), tabId: 2 },
    event({ type: "builtin_browser_tabs", tabs: [tab(1), tab(2)], activeTabId: 2 }),
  );

  it("replaces the registry whole on every tabs event", () => {
    const next = reduceBrowser(
      withTabs,
      event({ type: "builtin_browser_tabs", tabs: [tab(2, { title: "Renamed" })], activeTabId: 2 }),
    );
    expect(tabsInScope(next)).toEqual([tab(2, { title: "Renamed" })]);
  });

  it("removes a tab the server closed, page and all", () => {
    const next = reduceBrowser(withTabs, event({ type: "builtin_browser_close", tabId: 2 }));
    expect(tabsInScope(next).map((t) => t.id)).toEqual([1]);
    expect(next.guests.map((g) => g.tabId)).toEqual([1]);
    expect(activeTabIdInScope(next)).toBe(1);
  });

  it("closes a tab here at once, and keeps a stale snapshot from bringing it back", () => {
    const closed = reduceBrowser(withTabs, { type: "closed", tabId: 2 });
    expect(tabsInScope(closed).map((t) => t.id)).toEqual([1]);
    expect(closed.guests.map((g) => g.tabId)).toEqual([1]);
    expect(activeTabIdInScope(closed)).toBe(1);
    // A snapshot published before the close still lists tab 2.
    const stale = reduceBrowser(
      closed,
      event({ type: "builtin_browser_tabs", tabs: [tab(1), tab(2)], activeTabId: 2 }),
    );
    expect(tabsInScope(stale).map((t) => t.id)).toEqual([1]);
    expect(activeTabIdInScope(stale)).toBeNull();
    // Once the server stops listing it, the tab id is no longer held back.
    const settled = reduceBrowser(
      stale,
      event({ type: "builtin_browser_tabs", tabs: [tab(1)], activeTabId: 1 }),
    );
    expect(settled.closing[""]).toEqual([]);
    expect(activeTabIdInScope(settled)).toBe(1);
  });

  it("brings a tab to the front here before the server confirms", () => {
    const next = reduceBrowser(withTabs, { type: "activated", tabId: 1 });
    expect(activeTab(next)?.id).toBe(1);
    expect(reduceBrowser(next, { type: "activated", tabId: 1 })).toBe(next);
  });
});

describe("per-conversation isolation", () => {
  // One window, two conversations, each with its own page.
  const twoScopes = run(
    READY,
    open("a", { sessionId: "s1", partition: "persist:penguin-browser:s1" }),
    { type: "attached", key: guestKey("a"), tabId: 11 },
    open("b", { sessionId: "s2", partition: "persist:penguin-browser:s2" }),
    { type: "attached", key: guestKey("b"), tabId: 22 },
    listed([tab(11)], "s1"),
    listed([tab(22)], "s2"),
  );

  it("keeps each conversation's tabs and active tab apart", () => {
    expect(tabsInScope(twoScopes, "s1").map((t) => t.id)).toEqual([11]);
    expect(tabsInScope(twoScopes, "s2").map((t) => t.id)).toEqual([22]);
    expect(activeTab(twoScopes, "s1")?.id).toBe(11);
    expect(activeTab(twoScopes, "s2")?.id).toBe(22);
    // The default scope never picked up either conversation's tab.
    expect(tabsInScope(twoScopes)).toEqual([]);
  });

  it("scopes a tabs event by its sessionId, leaving the other conversation alone", () => {
    const next = reduceBrowser(twoScopes, listed([tab(22, { title: "Renamed" })], "s2"));
    expect(tabsInScope(next, "s1").map((t) => t.title)).toEqual(["Page 11"]);
    expect(tabsInScope(next, "s2").map((t) => t.title)).toEqual(["Renamed"]);
  });

  it("closes a tab in its own conversation only", () => {
    const next = reduceBrowser(twoScopes, { type: "closed", tabId: 11 });
    expect(tabsInScope(next, "s1")).toEqual([]);
    expect(next.closing["s1"]).toEqual([11]);
    expect(tabsInScope(next, "s2").map((t) => t.id)).toEqual([22]);
    expect(guestForTab(next, 11)).toBeNull();
    expect(guestForTab(next, 22)?.scope).toBe("s2");
  });

  it("brings a tab to the front in its own conversation only", () => {
    const next = reduceBrowser(twoScopes, { type: "activated", tabId: 11 });
    expect(activeTabIdInScope(next, "s1")).toBe(11);
    expect(activeTabIdInScope(next, "s2")).toBe(22);
  });

  it("marks activity by tab id across conversations", () => {
    const next = run(
      twoScopes,
      event({
        type: "builtin_browser_activity",
        tabId: 22,
        busy: true,
        action: "scan",
        sessionId: "s2",
      }),
    );
    expect(tabBusy(next, 22)).toBe(true);
    expect(tabBusy(next, 11)).toBe(false);
    expect(currentActivity(next, "s2")).toEqual({ action: "scan", sessionId: "s2" });
    expect(currentActivity(next, "s1")).toBeNull();
  });
});

describe("agent activity", () => {
  const busy = (tabId: number, on: boolean, sessionId?: string) =>
    event({
      type: "builtin_browser_activity",
      tabId,
      busy: on,
      action: "scan",
      ...(sessionId !== undefined ? { sessionId } : {}),
    });

  it("marks a tab while an agent acts in it", () => {
    const state = run(READY, busy(4, true, "s1"));
    expect(tabBusy(state, 4)).toBe(true);
    expect(currentActivity(state, "s1")).toEqual({ action: "scan", sessionId: "s1" });
    const done = reduceBrowser(state, busy(4, false));
    expect(tabBusy(done, 4)).toBe(false);
    expect(currentActivity(done, "s1")).toBeNull();
  });

  it("names the active tab's activity first", () => {
    const state = run(
      READY,
      event({ type: "builtin_browser_tabs", tabs: [tab(1), tab(2)], activeTabId: 2 }),
      busy(1, true),
      event({
        type: "builtin_browser_activity",
        tabId: 2,
        busy: true,
        action: "click",
      }),
    );
    expect(currentActivity(state)?.action).toBe("click");
  });

  it("drops the marks of a closed tab, and every mark on a resync", () => {
    const state = run(READY, busy(1, true), busy(2, true));
    expect(tabBusy(reduceBrowser(state, { type: "closed", tabId: 1 }), 1)).toBe(false);
    expect(currentActivity(reduceBrowser(state, { type: "resync" }))).toBeNull();
  });
});

describe("shouldReveal", () => {
  const onScreen = { conversation: "s1", browserShown: false };
  const opened = (sessionId?: string): BuiltinBrowserServerEvent => ({
    type: "builtin_browser_open",
    requestId: "r",
    url: "https://example.com/",
    activate: true,
    partition: "persist:penguin-browser",
    ...(sessionId !== undefined ? { sessionId } : {}),
  });
  const acting = (busy: boolean, sessionId = "s1"): BuiltinBrowserServerEvent => ({
    type: "builtin_browser_activity",
    tabId: 1,
    busy,
    action: "navigate",
    sessionId,
  });

  it("brings the browser up for the conversation on screen", () => {
    expect(shouldReveal(opened("s1"), onScreen, new Set())).toBe(true);
    expect(shouldReveal(acting(true), onScreen, new Set())).toBe(true);
  });

  it("leaves it alone for another conversation, no conversation, or a finished step", () => {
    expect(shouldReveal(opened("s2"), onScreen, new Set())).toBe(false);
    expect(shouldReveal(opened(), onScreen, new Set())).toBe(false);
    expect(shouldReveal(acting(false), onScreen, new Set())).toBe(false);
    expect(shouldReveal({ type: "builtin_browser_close", tabId: 1 }, onScreen, new Set())).toBe(
      false,
    );
  });

  it("does nothing while the browser is already showing", () => {
    expect(shouldReveal(acting(true), { ...onScreen, browserShown: true }, new Set())).toBe(false);
  });

  it("brings it up once per conversation, so hiding it again is respected", () => {
    expect(shouldReveal(acting(true), onScreen, new Set(["s1"]))).toBe(false);
  });
});

describe("settings", () => {
  it("has no homepage until the server names one, and follows it being cleared", () => {
    expect(READY.homepage).toBeNull();
    const set = reduceBrowser(READY, {
      type: "settings",
      settings: { homepage: "https://example.com/start" },
    });
    expect(set.homepage).toBe("https://example.com/start");
    const cleared = reduceBrowser(set, { type: "settings", settings: { homepage: null } });
    expect(cleared.homepage).toBeNull();
  });

  it("keeps the same state object when nothing changed, so nothing re-renders", () => {
    expect(reduceBrowser(READY, { type: "settings", settings: { homepage: null } })).toBe(READY);
  });

  it("keeps the homepage across the window's other changes", () => {
    const set = reduceBrowser(READY, {
      type: "settings",
      settings: { homepage: "https://example.com/start" },
    });
    const after = run(set, open("r1"), { type: "resync" }, { type: "supported", supported: false });
    expect(after.homepage).toBe("https://example.com/start");
  });
});

describe("load", () => {
  const heavy: BuiltinBrowserMetrics = {
    at: 1,
    tabs: [
      { tabId: 1, memoryKB: 1_400_000, cpuPercent: 3 },
      { tabId: 2, memoryKB: 300_000, cpuPercent: 0 },
    ],
    totalKB: 1_700_000,
    warnings: ["memory"],
    heavyTabIds: [1, 2],
  };

  it("has no measurement until the first one, then follows each", () => {
    expect(READY.metrics).toBeNull();
    const warned = run(READY, event({ type: "builtin_browser_metrics", metrics: heavy }));
    expect(warned.metrics).toEqual(heavy);
    const calm = { ...heavy, at: 2, totalKB: 500_000, warnings: [], heavyTabIds: [] };
    expect(run(warned, event({ type: "builtin_browser_metrics", metrics: calm })).metrics).toEqual(
      calm,
    );
  });

  it("takes the status's measurement, and keeps the last one when a status has none", () => {
    const listedTabs = [tab(1), tab(2)];
    const read = reduceBrowser(READY, status({ tabs: listedTabs, activeTabId: 1 }));
    const withMetrics = reduceBrowser(read, {
      type: "status",
      scope: "",
      status: { available: true, tabs: listedTabs, activeTabId: 1, metrics: heavy },
    });
    expect(withMetrics.metrics).toEqual(heavy);
    expect(
      reduceBrowser(withMetrics, status({ tabs: listedTabs, activeTabId: 1 })).metrics,
    ).toEqual(heavy);
  });

  it("shows a crashed tab as the server reports it", () => {
    const state = run(
      READY,
      event({ type: "builtin_browser_tabs", tabs: [tab(4, { crashed: "oom" })], activeTabId: 4 }),
    );
    expect(activeTab(state)?.crashed).toBe("oom");
  });
});

describe("the new-tab page", () => {
  it("is opened for a panel on screen with no tab: the first time, or after a restart", () => {
    expect(wantsNewTabPage(READY, "", true)).toBe(true);
  });

  it("is not opened out of sight, or where the browser cannot be used", () => {
    expect(wantsNewTabPage(READY, "", false)).toBe(false);
    expect(wantsNewTabPage(INITIAL_BROWSER_STATE, "", true)).toBe(false);
    expect(wantsNewTabPage(reduceBrowser(READY, { type: "unreachable" }), "", true)).toBe(false);
  });

  it("is not opened beside a tab that is open", () => {
    expect(wantsNewTabPage(run(READY, listed([tab(1)])), "", true)).toBe(false);
  });

  it("is opened in a conversation that has none, though another one has a tab", () => {
    const other = run(READY, listed([tab(1)], "s2"));
    expect(wantsNewTabPage(other, "", true)).toBe(true);
    expect(wantsNewTabPage(other, "s2", true)).toBe(false);
  });

  it("is not opened beside a tab on its way", () => {
    // Asked for by any window, the agent or a page: the page is being created here.
    const creating = run(READY, open("r1"));
    expect(wantsNewTabPage(creating, "", true)).toBe(false);
    // Claimed, not yet in the registry.
    const claimed = run(creating, { type: "attached", key: guestKey("r1"), tabId: 4 });
    expect(wantsNewTabPage(claimed, "", true)).toBe(false);
    // This window's own request, before the server has asked it for the page.
    const asking = reduceBrowser(READY, { type: "opening", delta: 1 });
    expect(wantsNewTabPage(asking, "", true)).toBe(false);
    expect(wantsNewTabPage(reduceBrowser(asking, { type: "opening", delta: -1 }), "", true)).toBe(
      true,
    );
  });

  it("replaces the last tab once it closes, however it closed", () => {
    const one = run(
      READY,
      open("r1"),
      { type: "attached", key: guestKey("r1"), tabId: 4 },
      listed([tab(4)]),
    );
    expect(wantsNewTabPage(one, "", true)).toBe(false);
    // Its × here, or the agent's close through the server.
    expect(wantsNewTabPage(reduceBrowser(one, { type: "closed", tabId: 4 }), "", true)).toBe(true);
    const byAgent = run(one, event({ type: "builtin_browser_close", tabId: 4 }));
    expect(wantsNewTabPage(byAgent, "", true)).toBe(true);
    // Closed while the panel was out of sight: nothing until it is shown again.
    expect(wantsNewTabPage(byAgent, "", false)).toBe(false);
  });

  it("counts this window's requests on their way, and never below none", () => {
    const twice = run(
      READY,
      { type: "opening", delta: 1 },
      { type: "opening", delta: 1 },
      { type: "opening", delta: -1 },
    );
    expect(twice.opening).toBe(1);
    expect(run(READY, { type: "opening", delta: -1 }).opening).toBe(0);
  });
});

describe("the address a tab shows", () => {
  const home = "https://home.example/";

  it("is the address its page was opened at while the first page is on its way", () => {
    const opening = tab(4, { url: "", title: "", loading: true });
    const state = run(
      READY,
      open("r1", { url: home }),
      { type: "attached", key: guestKey("r1"), tabId: 4 },
      event({ type: "builtin_browser_tabs", tabs: [opening], activeTabId: 4 }),
    );
    expect(addressOf(state, opening)).toBe(home);
  });

  it("is the page's own once it committed, and blank for a blank new tab", () => {
    const loaded = tab(4, { url: "https://home.example/welcome", loading: true });
    const state = run(READY, open("r1", { url: home }), {
      type: "attached",
      key: guestKey("r1"),
      tabId: 4,
    });
    expect(addressOf(state, loaded)).toBe("https://home.example/welcome");
    const blank = run(READY, open("r2", { url: "about:blank" }), {
      type: "attached",
      key: guestKey("r2"),
      tabId: 5,
    });
    expect(addressOf(blank, tab(5, { url: "", title: "", loading: true }))).toBe("");
  });

  it("is the registry's for a tab whose page this window does not host", () => {
    expect(addressOf(READY, tab(8, { url: "", title: "", loading: true }))).toBe("");
  });
});
