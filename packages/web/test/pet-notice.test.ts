/**
 * What the desktop pet says: which user-channel events are worth a bubble, what an update
 * snapshot does and does not announce, and the wording of both.
 *
 * The point of pinning this here is that the stream is broad and the pet is small: every test
 * below that expects null is the feature saying "this is not why a penguin should interrupt you".
 */
import { describe, expect, it } from "vitest";
import type { DesktopUpdateStatus, ServerEvent } from "@adelie/server/api";
import {
  noticeForEvent,
  noticeForUpdate,
  noticeKey,
  noticeText,
  updateCommand,
  updateText,
} from "../src/features/pet/pet-notice.js";
import { S } from "../src/lib/strings.js";
import { en } from "../src/lib/strings-en.js";

const status = (state: DesktopUpdateStatus["state"], rest: Partial<DesktopUpdateStatus> = {}) =>
  ({ appVersion: "0.5.1", state, ...rest }) as DesktopUpdateStatus;

describe("noticeForEvent", () => {
  it("speaks when a schedule fired", () => {
    const event = {
      type: "schedule_fired",
      projectId: "p",
      agentId: "a",
      name: "每日进度",
      sessionId: "s",
    } as ServerEvent;
    expect(noticeForEvent(event)).toEqual({ kind: "schedule", name: "每日进度" });
  });

  it("speaks about tool calls that are still waiting, and stays quiet once none are", () => {
    expect(noticeForEvent({ type: "session_approvals", sessionId: "s", count: 2 })).toEqual({
      kind: "approval",
      count: 2,
    });
    // The same event with a zero count is the last call being answered.
    expect(noticeForEvent({ type: "session_approvals", sessionId: "s", count: 0 })).toBeNull();
  });

  it("speaks about a budget warning or pause, not about a resume", () => {
    const base = { projectId: "p", orgId: "o", agentId: "a", ratio: 0.9 };
    expect(noticeForEvent({ ...base, type: "org_budget", state: "warned" })).toEqual({
      kind: "budget",
      state: "warned",
    });
    expect(noticeForEvent({ ...base, type: "org_budget", state: "paused" })).toEqual({
      kind: "budget",
      state: "paused",
    });
    expect(noticeForEvent({ ...base, type: "org_budget", state: "resumed" })).toBeNull();
  });

  it("stays quiet for everything the app's own chrome already shows", () => {
    const quiet: ServerEvent[] = [
      { type: "hello" },
      { type: "task_state", state: "idle" },
      { type: "session_title", sessionId: "s", title: "t" },
      {
        type: "session_state",
        sessionId: "s",
        projectId: "p",
        state: "idle",
        lastActiveAt: "2026-10-20T00:00:00Z",
        hasTrace: true,
      },
      { type: "session_background", sessionId: "s", processes: 1, subagents: 0 },
      { type: "credentials_updated" },
      { type: "resync_required" },
    ];
    for (const event of quiet) expect(noticeForEvent(event), event.type).toBeNull();
  });
});

describe("noticeForUpdate", () => {
  it("announces only the two states that ask the user to do something", () => {
    expect(noticeForUpdate(status("available", { version: "0.6.0" }))).toEqual({
      kind: "update",
      version: "0.6.0",
      ready: false,
    });
    expect(noticeForUpdate(status("downloaded", { version: "0.6.0" }))).toEqual({
      kind: "update",
      version: "0.6.0",
      ready: true,
    });
    // Progress, failures and the steady states belong in the panel, which the user opens.
    for (const state of [
      "idle",
      "checking",
      "downloading",
      "up-to-date",
      "error",
      "unsupported",
    ] as const) {
      expect(noticeForUpdate(status(state)), state).toBeNull();
    }
    expect(noticeForUpdate(null)).toBeNull();
    // An offer with no version in it is nothing to click.
    expect(noticeForUpdate(status("available"))).toBeNull();
  });
});

describe("noticeKey", () => {
  it("tells apart exactly what reads differently", () => {
    expect(noticeKey({ kind: "schedule", name: "a" })).not.toBe(
      noticeKey({ kind: "schedule", name: "b" }),
    );
    // The same state announced twice is one key, which is what keeps a poll from repeating itself.
    expect(noticeKey({ kind: "update", version: "1", ready: false })).toBe(
      noticeKey({ kind: "update", version: "1", ready: false }),
    );
    expect(noticeKey({ kind: "update", version: "1", ready: false })).not.toBe(
      noticeKey({ kind: "update", version: "1", ready: true }),
    );
  });
});

describe("noticeText", () => {
  it("words every notice, in both languages", () => {
    expect(noticeText({ kind: "schedule", name: "日报" }, S.pet)).toContain("日报");
    expect(noticeText({ kind: "approval", count: 3 }, S.pet)).toContain("3");
    expect(noticeText({ kind: "budget", state: "warned" }, S.pet)).toBe(S.pet.budgetWarned);
    expect(noticeText({ kind: "budget", state: "paused" }, S.pet)).toBe(S.pet.budgetPaused);
    expect(noticeText({ kind: "update", version: "0.6.0", ready: false }, S.pet)).toContain(
      "0.6.0",
    );
    expect(noticeText({ kind: "update", version: "0.6.0", ready: true }, S.pet)).toContain("0.6.0");
    // The English dictionary answers the same call — the shape is shared, not the words.
    expect(noticeText({ kind: "schedule", name: "Daily" }, en.pet)).toContain("Daily");
    expect(noticeText({ kind: "budget", state: "paused" }, en.pet)).toBe(en.pet.budgetPaused);
  });
});

describe("updateText", () => {
  it("reads every state the shell can be in", () => {
    expect(updateText(null, S.pet)).toBe(S.pet.updateIdle);
    expect(updateText(status("idle"), S.pet)).toBe(S.pet.updateIdle);
    expect(updateText(status("checking"), S.pet)).toBe(S.pet.updateChecking);
    expect(updateText(status("up-to-date"), S.pet)).toBe(S.pet.updateUpToDate("0.5.1"));
    expect(updateText(status("available", { version: "0.6.0" }), S.pet)).toBe(
      S.pet.updateAvailable("0.6.0"),
    );
    expect(updateText(status("downloading", { version: "0.6.0", percent: 42 }), S.pet)).toBe(
      S.pet.updateDownloading(42),
    );
    expect(updateText(status("downloaded", { version: "0.6.0" }), S.pet)).toBe(
      S.pet.updateDownloaded("0.6.0"),
    );
    expect(updateText(status("unsupported", { reason: "dev" }), S.pet)).toBe(
      S.pet.updateUnsupported,
    );
    expect(updateText(status("error", { message: "offline" }), S.pet)).toBe(
      S.pet.updateError("offline"),
    );
  });

  it("falls back to a quiet line when a state arrives without the field it needs", () => {
    expect(updateText(status("available"), S.pet)).toBe(S.pet.updateIdle);
    expect(updateText(status("downloaded"), S.pet)).toBe(S.pet.updateIdle);
    // A download with no percentage reported is 0%, not NaN.
    expect(updateText(status("downloading", { version: "0.6.0" }), S.pet)).toBe(
      S.pet.updateDownloading(0),
    );
  });
});

describe("updateCommand", () => {
  it("offers the one action each state is waiting for, and none while one is under way", () => {
    expect(updateCommand(null)).toBe("check");
    expect(updateCommand(status("idle"))).toBe("check");
    expect(updateCommand(status("up-to-date"))).toBe("check");
    expect(updateCommand(status("error"))).toBe("check");
    expect(updateCommand(status("unsupported"))).toBe("check");
    expect(updateCommand(status("available", { version: "0.6.0" }))).toBe("download");
    expect(updateCommand(status("downloaded", { version: "0.6.0" }))).toBe("install");
    expect(updateCommand(status("checking"))).toBeNull();
    expect(updateCommand(status("downloading", { version: "0.6.0" }))).toBeNull();
  });
});
