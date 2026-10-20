/**
 * What the desktop pet says, and when it says it: the user-channel events it reacts to, the
 * client-update snapshots it speaks about, and the wording of both.
 *
 * Pure — no React, no fetch — so the rules live in one place: the page that draws the pet renders
 * exactly what these functions return, and the tests pin which events are worth a bubble and
 * which are not. The events are the user-level stream `GET /api/events` (see api/sse.ts), which is
 * already the cross-Session channel: a tab that is looking at one conversation is told here about
 * a schedule that fired somewhere else.
 *
 * Three things are worth speaking up about, chosen for the same reason — the person is looking at
 * the desktop, not at the app, and cannot see the row that changed:
 *
 * - a schedule fired (it ran something on its own),
 * - tool calls are waiting for approval (the agent is stopped until someone answers),
 * - a company budget warned or paused an employee (money, and the run stops).
 *
 * Everything else on that stream is either something the app's own chrome already shows (a
 * session's run state, its title, a tab count) or noise at this size (every channel message). The
 * app's task-completion notification is its own, deliberately separate feature: it is a system
 * notification for a window you are not looking at, and this is a bubble on the desktop.
 */
import type { DesktopUpdateStatus, ServerEvent } from "@adelie/server/api";
import type { Strings } from "../../lib/strings";

/** One thing the pet has to say. Small enough to be a union, so the wording is exhaustive. */
export type PetNotice =
  /** A schedule fired and sent its Prompt. */
  | { kind: "schedule"; name: string }
  /** Tool calls are waiting for a person to answer them (the count is the Session row's). */
  | { kind: "approval"; count: number }
  /** The organization's scheduler warned about, or paused, an employee's budget. */
  | { kind: "budget"; state: "warned" | "paused" }
  /** A newer client build is offered (`ready` false) or downloaded and waiting for a restart. */
  | { kind: "update"; version: string; ready: boolean };

/**
 * The notice one user-channel event earns, or null for the many that earn none. Exhaustive over
 * the events the pet knows and open-ended for the rest: the stream grows, and a new event type
 * must not be a compile error in a feature that only wants to be told about a few of them.
 */
export function noticeForEvent(event: ServerEvent): PetNotice | null {
  switch (event.type) {
    case "schedule_fired":
      return { kind: "schedule", name: event.name };
    // Only calls that are still waiting: the same event with a zero count is the last one being
    // answered, which is the opposite of something to speak about.
    case "session_approvals":
      return event.count > 0 ? { kind: "approval", count: event.count } : null;
    case "org_budget":
      // "resumed" is good news, and the least urgent thing on this stream.
      return event.state === "resumed" ? null : { kind: "budget", state: event.state };
    default:
      return null;
  }
}

/**
 * The notice one client-update snapshot earns, or null when there is nothing to announce. Only
 * the two states that ask the user to do something — an update to fetch, or a downloaded build to
 * restart into. Progress and failures belong in the panel behind the penguin, where they can be
 * read at leisure; a bubble is for the moment the pet has something to say.
 *
 * A snapshot that has not changed earns nothing either, which the caller decides: this reads one
 * snapshot on its own, and the page remembers what it has already announced (see noticeKey).
 */
export function noticeForUpdate(status: DesktopUpdateStatus | null): PetNotice | null {
  if (status === null || status.version === undefined) return null;
  if (status.state === "available")
    return { kind: "update", version: status.version, ready: false };
  if (status.state === "downloaded") {
    return { kind: "update", version: status.version, ready: true };
  }
  return null;
}

/**
 * A stable identity for one notice: what the page compares against the last one it announced, so
 * a poll that keeps returning the same state does not repeat itself, and what React keys a list
 * of them by. Two sentences with the same key read the same.
 */
export function noticeKey(notice: PetNotice): string {
  switch (notice.kind) {
    case "schedule":
      return `schedule:${notice.name}`;
    case "approval":
      return `approval:${notice.count}`;
    case "budget":
      return `budget:${notice.state}`;
    case "update":
      return `update:${notice.version}:${notice.ready ? "ready" : "offered"}`;
  }
}

/** One notice as the bubble says it. */
export function noticeText(notice: PetNotice, pet: Strings["pet"]): string {
  switch (notice.kind) {
    case "schedule":
      return pet.scheduleFired(notice.name);
    case "approval":
      return pet.approvalsWaiting(notice.count);
    case "budget":
      return notice.state === "paused" ? pet.budgetPaused : pet.budgetWarned;
    case "update":
      return notice.ready
        ? pet.updateDownloaded(notice.version)
        : pet.updateAvailable(notice.version);
  }
}

/**
 * What the panel's update row reads: the state the shell is in, in one line. A null snapshot is
 * "no check has run yet" — the shell pushes one a beat after the server starts — and the page
 * substitutes the desktop-only wording itself when it is not the shell's own window.
 */
export function updateText(status: DesktopUpdateStatus | null, pet: Strings["pet"]): string {
  if (status === null) return pet.updateIdle;
  switch (status.state) {
    case "idle":
      return pet.updateIdle;
    case "checking":
      return pet.updateChecking;
    case "up-to-date":
      return pet.updateUpToDate(status.appVersion);
    case "available":
      return status.version !== undefined ? pet.updateAvailable(status.version) : pet.updateIdle;
    case "downloading":
      return pet.updateDownloading(status.percent ?? 0);
    case "downloaded":
      return status.version !== undefined ? pet.updateDownloaded(status.version) : pet.updateIdle;
    case "unsupported":
      return pet.updateUnsupported;
    case "error":
      return pet.updateError(status.message ?? "");
  }
}

/**
 * What the panel's update row offers to DO, given the state: fetch the release the shell has
 * offered, restart into the one it has downloaded, ask for a check, or nothing at all. The three
 * commands are the ones the main window's update modal sends (POST /api/desktop/update/…), and
 * clicking here is the same consent it collects there.
 */
export function updateCommand(
  status: DesktopUpdateStatus | null,
): "check" | "download" | "install" | null {
  switch (status?.state) {
    case undefined:
    case "idle":
    case "unsupported":
    case "up-to-date":
    case "error":
      return "check";
    case "available":
      return "download";
    case "downloaded":
      return "install";
    // A check or a download already under way has nothing to click.
    case "checking":
    case "downloading":
      return null;
  }
}
