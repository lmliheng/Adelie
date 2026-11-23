/**
 * The admin's notices for THIS account: the menu row's unread badge and the inbox the row opens.
 *
 * The durable state is `GET /api/notifications` — a notice is stored, so one sent while this window
 * was closed is already in the badge when it comes back. The live step is the user channel: the
 * one `/api/events` connection (state/sessions.tsx) forwards each `notification` event here, and a
 * notice sent while the app is open moves the badge without a reload.
 *
 * One module-level store rather than a per-Provider one: the badge (the account menu's row) and
 * the dialog it opens are the same list seen twice, and the user channel that feeds it outlives
 * every page, so the state has to as well. React reads it through `useSyncExternalStore`, and the
 * store is the only writer — the hook never keeps a second copy the two surfaces could disagree
 * about.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { NotificationInfo, NotificationsResponse, ServerEvent } from "@adelie/server/api";
import * as api from "../api/endpoints";
import { apiErrorText } from "../lib/api-error";

/** The user-channel variant that carries one notice to its reader. */
export type NotificationServerEvent = Extract<ServerEvent, { type: "notification" }>;

export function isNotificationEvent(ev: ServerEvent): ev is NotificationServerEvent {
  return ev.type === "notification";
}

export interface NotificationsState {
  /** This account's inbox, newest first, as the last read or event left it. */
  notifications: NotificationInfo[];
  /** How many of them are unread; what the account menu's badge shows. */
  unread: number;
  /** Whether a read has landed at least once, so the empty list means "none" rather than "not yet". */
  loaded: boolean;
  /** The last failure, for the dialog to show; a failed read leaves the previous list standing. */
  error: string | null;
}

const EMPTY: NotificationsState = { notifications: [], unread: 0, loaded: false, error: null };

let state: NotificationsState = EMPTY;
const listeners = new Set<() => void>();

/**
 * Every notice the user channel has added, with the sequence number at which it did. It exists to
 * answer one question a read cannot answer by itself: was this notice already on the server when
 * the read went out, or did it arrive while the read was in flight? An id in here with a number
 * above a read's baseline arrived DURING that read, so that read's answer cannot be the later word
 * about it (see {@link adoptInbox}) — the same rule `mergeRunningSessions` applies to a status the
 * channel moved.
 */
const liveArrivals = new Map<number, number>();
let liveSeq = 0;

function setState(next: Partial<NotificationsState>): void {
  state = { ...state, ...next };
  for (const listener of [...listeners]) listener();
}

/** Subscribes to store changes; the pair with {@link notificationsSnapshot} is what React reads. */
export function subscribeNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current snapshot. Its identity changes only on a write, which is what React compares. */
export function notificationsSnapshot(): NotificationsState {
  return state;
}

/**
 * A notice arrived on the user channel: put it at the head of the inbox and count it unread. The
 * event carries the whole notice, so no fetch is needed; an id already present is ignored, which
 * is what keeps a re-delivery (or a notice the mount read already returned) from counting twice.
 */
export function publishNotificationEvent(notification: NotificationInfo): void {
  if (state.notifications.some((n) => n.id === notification.id)) return;
  liveSeq += 1;
  liveArrivals.set(notification.id, liveSeq);
  setState({ notifications: [notification, ...state.notifications], unread: state.unread + 1 });
}

/** Forgets everything — a sign-out must not leave the next account's badge showing this one's. */
export function resetNotifications(): void {
  liveArrivals.clear();
  setState(EMPTY);
}

/**
 * A whole-inbox answer becomes the new state, minus one thing: a notice that arrived on the channel
 * WHILE this request was in flight is not in the answer (the server read its table before that
 * notice existed), so it is kept at the head and still counted unread. Letting the answer erase it
 * would make the badge miss a notice that was sent exactly while the page was reading — the reader
 * would have to open the dialog to find it.
 *
 * `baseline` is the arrival counter as it stood when the request was SENT.
 */
function adoptInbox(res: NotificationsResponse, baseline: number): void {
  const answered = new Set(res.notifications.map((n) => n.id));
  const arrived = state.notifications.filter(
    (n) => (liveArrivals.get(n.id) ?? 0) > baseline && !answered.has(n.id),
  );
  // The answer carries these rows too now, so the marker has nothing left to say about them.
  for (const id of answered) liveArrivals.delete(id);
  setState({
    notifications: [...arrived, ...res.notifications],
    unread: res.unread + arrived.length,
    loaded: true,
    error: null,
  });
}

/**
 * Re-reads the inbox. Called on mount, on each account switch, when the dialog opens (the numbers
 * move while it is closed) and after the channel reports it lost events (`resync_required`).
 */
export async function refreshNotifications(): Promise<void> {
  const baseline = liveSeq;
  try {
    adoptInbox(await api.listNotifications(), baseline);
  } catch (e) {
    setState({ loaded: true, error: apiErrorText(e) });
  }
}

/** Marks one notice read; the server answers the whole inbox, which becomes the new state. */
export async function markNotificationRead(id: number): Promise<void> {
  const baseline = liveSeq;
  try {
    adoptInbox(await api.markNotificationRead(id), baseline);
  } catch (e) {
    setState({ error: apiErrorText(e) });
  }
}

/** Marks every unread notice read; same whole-inbox answer as the single one. */
export async function markAllNotificationsRead(): Promise<void> {
  const baseline = liveSeq;
  try {
    adoptInbox(await api.markAllNotificationsRead(), baseline);
  } catch (e) {
    setState({ error: apiErrorText(e) });
  }
}

/**
 * The inbox and its badge for a mounted component. The first mount reads once; a later account
 * (or a sign-out, `null`) resets and re-reads, so the badge never carries one account's count into
 * another. The account is the caller's (`useAuth()` lives at the call site), which keeps this store
 * free of a dependency on the auth module.
 */
export function useNotifications(userId: string | null): NotificationsState {
  const snap = useSyncExternalStore(subscribeNotifications, notificationsSnapshot);
  useEffect(() => {
    if (userId === null) {
      resetNotifications();
      return;
    }
    void refreshNotifications();
  }, [userId]);
  return snap;
}
