/**
 * The built-in browser's state in this window, as a pure reducer.
 *
 * The browser is per-conversation: a "scope" is the conversation a set of pages belongs to — a
 * Session id, or `""` for the default one (a draft, a page with no conversation). Two lists,
 * from two sources:
 * - `tabs`/`activeTabId`/`closing` are PER SCOPE. They are the SERVER's registry — what the
 *   desktop shell reports about every guest page (address, title, loading, history) and which
 *   one is active — and the user channel's `builtin_browser_tabs` event (which names its
 *   conversation) replaces one scope's list whole. The strip and the toolbar render the list of
 *   the conversation on screen and no other's.
 * - `guests` are the `<webview>` elements THIS window hosts, in creation order, across every
 *   conversation (a page an agent works in stays alive while the user is looking elsewhere). A
 *   guest starts from a `builtin_browser_open` request, learns its tab id once it attaches, and
 *   is removed by a close. The order is the DOM order of the elements and must never change:
 *   moving a webview in the DOM reloads its page, so guests are only ever appended or removed.
 *
 * A guest carries the scope and the Chromium partition it runs in (from the open event), so its
 * page lives in its conversation's own cookie jar and is shown only over that conversation's slot.
 *
 * Activity (`builtin_browser_activity`) marks the tabs an agent is working in right now (by tab
 * id, across scopes), the homepage is the server's setting as this window last read or saved it,
 * and the metrics are the browser's load with the server's verdict on it (`builtin_browser_metrics`,
 * about every 10 s).
 *
 * The browser keeps a tab while its panel is on screen: with none open in the conversation shown
 * and none on its way, the window opens the new-tab page by itself (`wantsNewTabPage`), the
 * homepage or a blank page.
 */
import type {
  BuiltinBrowserAction,
  BuiltinBrowserMetrics,
  BuiltinBrowserServerEvent,
  BuiltinBrowserSettings,
  BuiltinBrowserStatus,
  BuiltinBrowserTab,
} from "@adelie/server/api";
import { BLANK_URL, tabAddress } from "./address";

/** One webview this window hosts. */
export interface BrowserGuest {
  /** Stable for the element's whole life: it is the React key, and a remount reloads the page. */
  key: string;
  /** The address the element was created with. Never changes, even as the page navigates. */
  src: string;
  /** The Chromium partition the page runs in — its conversation's own cookie jar. */
  partition: string;
  /** The conversation this page belongs to (`""` = the default scope). */
  scope: string;
  /** The open request this guest answers, claimed once it has a tab id. */
  requestId: string;
  /** The guest's webContents id, known once it attached. */
  tabId: number | null;
  /** Whether it comes to the front once claimed. */
  activate: boolean;
}

export interface BrowserActivity {
  action: BuiltinBrowserAction;
  sessionId?: string;
}

export interface BrowserState {
  /** This window can host guests at all: Electron's `<webview>` element exists here. */
  supported: boolean;
  /** The server can drive the browser (desktop shell connected and new enough). */
  available: boolean;
  /** Why not, when the server said so. */
  reason: BuiltinBrowserStatus["reason"] | null;
  /** The server's registry of each conversation's tabs, by scope (`""` = the default scope). */
  tabs: Readonly<Record<string, BuiltinBrowserTab[]>>;
  /** Each conversation's active tab, by scope. */
  activeTabId: Readonly<Record<string, number | null>>;
  guests: BrowserGuest[];
  /** Tabs an agent is acting on right now, by tab id (a tab id belongs to one conversation). */
  activity: Readonly<Record<number, BrowserActivity>>;
  /**
   * Tabs this window closed and the server has not yet dropped, by scope. A registry snapshot
   * published before the close would otherwise put a closed tab back in the strip for a moment.
   */
  closing: Readonly<Record<string, readonly number[]>>;
  /** The page a new tab and the Home button open; null for none (new tabs are blank). */
  homepage: string | null;
  /** The browser's load as last measured, with the server's warnings; null before the first measurement. */
  metrics: BuiltinBrowserMetrics | null;
  /** This window's own requests for a new tab that have not been answered yet. */
  opening: number;
}

export type BrowserAction =
  | { type: "supported"; supported: boolean }
  /** A status read for one conversation (`scope`): its tabs and active one, the rest shared. */
  | { type: "status"; scope: string; status: BuiltinBrowserStatus }
  /** The status could not be read at all (an older server, a member account, no network). */
  | { type: "unreachable" }
  | { type: "event"; event: BuiltinBrowserServerEvent }
  /** A guest attached and reported its tab id. */
  | { type: "attached"; key: string; tabId: number }
  /** Another window claimed this guest's request first: this copy goes. */
  | { type: "rejected"; key: string }
  /** The user closed a tab here (its ×, or the page called window.close()). */
  | { type: "closed"; tabId: number }
  /** The user brought a tab to the front here; the server confirms with a tabs event. */
  | { type: "activated"; tabId: number }
  /** Events may have been lost: activity marks can no longer be trusted. */
  | { type: "resync" }
  /** The browser's settings as the server holds them (read, or answered to a save). */
  | { type: "settings"; settings: BuiltinBrowserSettings }
  /** This window asked for a new tab (1), or heard the answer (-1). */
  | { type: "opening"; delta: 1 | -1 };

export const INITIAL_BROWSER_STATE: BrowserState = {
  supported: false,
  available: false,
  reason: null,
  tabs: {},
  activeTabId: {},
  guests: [],
  activity: {},
  closing: {},
  homepage: null,
  metrics: null,
  opening: 0,
};

/** The key a guest is known by, from the request that created it. */
export function guestKey(requestId: string): string {
  return `request:${requestId}`;
}

/** One conversation's tabs (the default scope when none is named). */
export function tabsInScope(state: BrowserState, scope = ""): BuiltinBrowserTab[] {
  return state.tabs[scope] ?? [];
}

/** One conversation's active tab id. */
export function activeTabIdInScope(state: BrowserState, scope = ""): number | null {
  return state.activeTabId[scope] ?? null;
}

/** The scope a listed tab belongs to; null for one no registry lists (yet). */
function scopeOfTab(state: BrowserState, tabId: number): string | null {
  for (const [scope, tabs] of Object.entries(state.tabs)) {
    if (tabs.some((tab) => tab.id === tabId)) return scope;
  }
  return null;
}

function withoutActivity(
  activity: Readonly<Record<number, BrowserActivity>>,
  tabId: number,
): Readonly<Record<number, BrowserActivity>> {
  if (!(tabId in activity)) return activity;
  const { [tabId]: _dropped, ...rest } = activity;
  return rest;
}

/** One scope's registry snapshot, minus the tabs this window is closing; a closing tab it no longer lists is gone for good. */
function applyTabs(
  state: BrowserState,
  scope: string,
  tabs: BuiltinBrowserTab[],
  activeTabId: number | null,
): BrowserState {
  const listed = new Set(tabs.map((tab) => tab.id));
  const closing = (state.closing[scope] ?? []).filter((id) => listed.has(id));
  const shown = closing.length === 0 ? tabs : tabs.filter((tab) => !closing.includes(tab.id));
  const active = activeTabId !== null && closing.includes(activeTabId) ? null : activeTabId;
  return {
    ...state,
    available: true,
    reason: null,
    tabs: { ...state.tabs, [scope]: shown },
    activeTabId: { ...state.activeTabId, [scope]: active },
    closing: { ...state.closing, [scope]: closing },
  };
}

function applyEvent(state: BrowserState, event: BuiltinBrowserServerEvent): BrowserState {
  switch (event.type) {
    case "builtin_browser_tabs":
      return applyTabs(state, event.sessionId ?? "", event.tabs, event.activeTabId);
    case "builtin_browser_open": {
      // Only a window that can host a guest takes the request; a replayed event must not
      // create a second guest for the same request.
      if (!state.supported || state.guests.some((guest) => guest.requestId === event.requestId))
        return state;
      const guest: BrowserGuest = {
        key: guestKey(event.requestId),
        // A webview with no address never creates its page, so it would never be claimed.
        src: event.url === "" ? BLANK_URL : event.url,
        partition: event.partition,
        scope: event.sessionId ?? "",
        requestId: event.requestId,
        tabId: null,
        activate: event.activate,
      };
      return { ...state, available: true, reason: null, guests: [...state.guests, guest] };
    }
    case "builtin_browser_close":
      return closeTab(state, event.tabId);
    case "builtin_browser_metrics":
      return { ...state, metrics: event.metrics };
    case "builtin_browser_activity": {
      if (!event.busy) return { ...state, activity: withoutActivity(state.activity, event.tabId) };
      const mark: BrowserActivity =
        event.sessionId !== undefined
          ? { action: event.action, sessionId: event.sessionId }
          : { action: event.action };
      return { ...state, activity: { ...state.activity, [event.tabId]: mark } };
    }
  }
}

/** Drops a tab everywhere this window knows it: its guest, its conversation's strip entry, its activity mark. */
function closeTab(state: BrowserState, tabId: number): BrowserState {
  const scope = scopeOfTab(state, tabId);
  const guests = state.guests.filter((guest) => guest.tabId !== tabId);
  const activity = withoutActivity(state.activity, tabId);
  if (scope === null) return { ...state, guests, activity };
  const tabs = tabsInScope(state, scope).filter((tab) => tab.id !== tabId);
  // The server names the next active tab in its next snapshot; until then the newest one
  // left stands in, which is the server's own fallback.
  const previous = state.activeTabId[scope] ?? null;
  const activeTabId = previous === tabId ? (tabs[tabs.length - 1]?.id ?? null) : previous;
  return {
    ...state,
    tabs: { ...state.tabs, [scope]: tabs },
    activeTabId: { ...state.activeTabId, [scope]: activeTabId },
    guests,
    activity,
  };
}

export function reduceBrowser(state: BrowserState, action: BrowserAction): BrowserState {
  switch (action.type) {
    case "supported":
      if (state.supported === action.supported) return state;
      // A window that stops hosting (the layer unmounting on sign-out) takes its pages with it.
      return action.supported
        ? { ...state, supported: true }
        : { ...state, supported: false, guests: [], activity: {} };
    case "status": {
      const { status } = action;
      const next = applyTabs(state, action.scope, status.tabs, status.activeTabId);
      return {
        ...next,
        available: status.available,
        reason: status.reason ?? null,
        metrics: status.metrics ?? next.metrics,
      };
    }
    case "unreachable":
      return { ...state, available: false, reason: null };
    case "event":
      return applyEvent(state, action.event);
    case "attached": {
      // One guest per tab id: a guest reporting an id another guest already holds is the
      // same page seen twice, and the first keeps it.
      if (state.guests.some((guest) => guest.tabId === action.tabId && guest.key !== action.key))
        return state;
      const guests = state.guests.map((guest) =>
        guest.key === action.key && guest.tabId === null
          ? { ...guest, tabId: action.tabId }
          : guest,
      );
      return { ...state, guests };
    }
    case "rejected":
      return { ...state, guests: state.guests.filter((guest) => guest.key !== action.key) };
    case "closed": {
      const scope = scopeOfTab(state, action.tabId);
      const next = closeTab(state, action.tabId);
      if (scope === null) return next;
      const closing = next.closing[scope] ?? [];
      return closing.includes(action.tabId)
        ? next
        : { ...next, closing: { ...next.closing, [scope]: [...closing, action.tabId] } };
    }
    case "activated": {
      const scope = scopeOfTab(state, action.tabId);
      if (scope === null || state.activeTabId[scope] === action.tabId) return state;
      return { ...state, activeTabId: { ...state.activeTabId, [scope]: action.tabId } };
    }
    case "resync":
      return { ...state, activity: {} };
    case "settings":
      return state.homepage === action.settings.homepage
        ? state
        : { ...state, homepage: action.settings.homepage };
    case "opening":
      return { ...state, opening: Math.max(0, state.opening + action.delta) };
  }
}

// ------------------------------------------------------------------------------ selectors

/** Whether the dock offers the browser at all. */
export function browserOffered(state: BrowserState): boolean {
  return state.supported && state.available;
}

export function activeTab(state: BrowserState, scope = ""): BuiltinBrowserTab | null {
  const id = state.activeTabId[scope] ?? null;
  return tabsInScope(state, scope).find((tab) => tab.id === id) ?? null;
}

export function guestByKey(state: BrowserState, key: string): BrowserGuest | null {
  return state.guests.find((guest) => guest.key === key) ?? null;
}

export function guestForTab(state: BrowserState, tabId: number | null): BrowserGuest | null {
  if (tabId === null) return null;
  return state.guests.find((guest) => guest.tabId === tabId) ?? null;
}

/**
 * A tab's address as this window shows it: its page's, or while its first page is still on its
 * way, the address this window created the page at (address.ts `tabAddress`).
 */
export function addressOf(state: BrowserState, tab: BuiltinBrowserTab): string {
  return tabAddress(tab, guestForTab(state, tab.id)?.src ?? null);
}

/**
 * Whether this window should open the new-tab page by itself: its browser panel is on screen for
 * `scope`, the browser can be used, and that conversation has no tab, none open and none on its
 * way. A tab on its way is a page this window is creating or has created in `scope` and the
 * registry does not list yet (from any window's, the agent's or a page's request), or a request
 * of this window's not yet answered. Each conversation keeps its own page, so switching to one
 * with none opens its own.
 */
export function wantsNewTabPage(
  state: BrowserState,
  scope: string,
  panelOnScreen: boolean,
): boolean {
  return (
    panelOnScreen &&
    browserOffered(state) &&
    tabsInScope(state, scope).length === 0 &&
    !state.guests.some((guest) => guest.scope === scope) &&
    state.opening === 0
  );
}

/**
 * The mark of an agent working in `scope`'s browser, its active tab's first when it is one of
 * them. A mark belongs to the conversation its action came from (the event's `sessionId`), so an
 * agent working in another conversation's browser never raises this one's.
 */
export function currentActivity(state: BrowserState, scope = ""): BrowserActivity | null {
  const mine = (mark: BrowserActivity): boolean => (mark.sessionId ?? "") === scope;
  const active = state.activeTabId[scope] ?? null;
  if (active !== null) {
    const mark = state.activity[active];
    if (mark !== undefined && mine(mark)) return mark;
  }
  for (const mark of Object.values(state.activity)) if (mine(mark)) return mark;
  return null;
}

/** Whether an agent is working in this tab right now. */
export function tabBusy(state: BrowserState, tabId: number): boolean {
  return state.activity[tabId] !== undefined;
}

/**
 * Whether an event should bring the browser's dock tab on screen: an agent opened a page or
 * started acting for the conversation the user is looking at, and the browser is not already
 * showing. Once per conversation: after the first reveal, hiding the browser is the user's
 * answer, and every later step of the same agent run popping it back open would fight it.
 */
export function shouldReveal(
  event: BuiltinBrowserServerEvent,
  onScreen: { conversation: string; browserShown: boolean },
  revealed: ReadonlySet<string>,
): boolean {
  const sessionId =
    event.type === "builtin_browser_open" ||
    (event.type === "builtin_browser_activity" && event.busy)
      ? event.sessionId
      : undefined;
  return (
    sessionId !== undefined &&
    sessionId === onScreen.conversation &&
    !onScreen.browserShown &&
    !revealed.has(sessionId)
  );
}
