/**
 * Which row carries the enable switch's refusal (src/features/schedules/schedule-toggle.ts).
 *
 * The two surfaces that list tasks keep their own copy of the refusal, so this is the one rule
 * they share: a task is named by its Agent's directory plus the file name, and only the row the
 * refused flip named may draw that sentence — a sentence about one task under another would read
 * as a failure of that one.
 */
import { describe, expect, it } from "vitest";
import { scheduleRefusalFor } from "../src/features/schedules/schedule-toggle";
import type { ScheduleToggleRefusal } from "../src/features/schedules/schedule-toggle";

const refused: ScheduleToggleRefusal = {
  agentId: "default_agent",
  name: "daily_probe",
  text: "该定时任务已不存在。",
};

describe("scheduleRefusalFor", () => {
  it("draws nothing while no flip has been refused", () => {
    expect(scheduleRefusalFor(null, { agentId: "default_agent", name: "daily_probe" })).toBeNull();
  });

  it("draws the sentence on the row the refused flip named", () => {
    expect(scheduleRefusalFor(refused, { agentId: "default_agent", name: "daily_probe" })).toBe(
      "该定时任务已不存在。",
    );
  });

  it("keeps quiet on another task of the same Agent — that row was never written to", () => {
    expect(
      scheduleRefusalFor(refused, { agentId: "default_agent", name: "weekly_probe" }),
    ).toBeNull();
  });

  it("keeps quiet on another Agent's task of the same name — a task is its directory plus its file", () => {
    expect(
      scheduleRefusalFor(refused, { agentId: "reviewer_agent", name: "daily_probe" }),
    ).toBeNull();
  });
});
