/**
 * A refused recall of a queued message (src/features/chat/queued-recall-refusal.ts): the sentence
 * the composer draws under the queued line whose 撤回 button was pressed.
 *
 * The line stays on screen with its content and its button, so the sentence is the only thing
 * saying why nothing was withdrawn — and both queues (mid-run steering, follow-ups) hang in the
 * same card, so it has to say *which* line it belongs to. Four things the module has to get right:
 * an answer the server gave speaks the interface's own language rather than the wire message
 * (7.19's rule), the queue and the entry id come back with it, a failure this codebase raised
 * itself keeps what it knows, and the sentence never claims the recall happened.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import {
  queuedRecallRefused,
  queuedRecallRefusalHosted,
  queuedRecallRefusalShown,
} from "../src/features/chat/queued-recall-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("queuedRecallRefused", () => {
  it("reads the refusal through its code's own sentence, and keeps the queue and the entry", () => {
    const refusal = queuedRecallRefused(
      "steer",
      "steer-7",
      new ApiError(409, "not_pending", "The steering message is no longer pending."),
    );
    expect(refusal.queue).toBe("steer");
    expect(refusal.id).toBe("steer-7");
    // The wire message is English-only; the sentence the reader gets is the dictionary's, which
    // already says whether the message reached the model.
    expect(refusal.text).not.toContain("no longer pending");
    expect(refusal.text).toBe(S.chat.recallQueuedRefused(S.errors.byCode.not_pending as string));
  });

  it("tells the two queues' 409s apart, because the routes answer with different codes", () => {
    const followUp = queuedRecallRefused(
      "followUp",
      "fu-1",
      new ApiError(409, "follow_up_started", "The follow-up already started."),
    );
    expect(followUp.text).toBe(
      S.chat.recallQueuedRefused(S.errors.byCode.follow_up_started as string),
    );
    expect(followUp.text).not.toBe(
      S.chat.recallQueuedRefused(S.errors.byCode.not_pending as string),
    );
  });

  it("keeps the message of an error this codebase raised itself", () => {
    const refusal = queuedRecallRefused("steer", "steer-8", new Error("network down"));
    expect(refusal.text).toBe(S.chat.recallQueuedRefused("network down"));
  });

  it("never claims the recall happened", () => {
    const refusal = queuedRecallRefused(
      "steer",
      "steer-9",
      new ApiError(500, "internal_error", "Internal server error"),
    );
    expect(refusal.text).toContain("没能撤回");
    expect(refusal.text).not.toContain("已撤回");
  });

  it("switches language with the interface", () => {
    setActiveStrings(EN);
    const refusal = queuedRecallRefused(
      "steer",
      "steer-10",
      new ApiError(409, "not_pending", "The steering message is no longer pending."),
    );
    expect(refusal.text).toBe(EN.chat.recallQueuedRefused(EN.errors.byCode.not_pending as string));
  });
});

describe("queuedRecallRefusalShown", () => {
  const refusal = queuedRecallRefused("steer", "steer-1", new Error("boom"));

  it("draws only under the line it was raised for", () => {
    expect(queuedRecallRefusalShown(refusal, "steer", "steer-1")).toBe(refusal.text);
    expect(queuedRecallRefusalShown(refusal, "steer", "steer-2")).toBeNull();
  });

  it("does not cross queues when the two entries happen to share an id", () => {
    expect(queuedRecallRefusalShown(refusal, "followUp", "steer-1")).toBeNull();
  });

  it("draws nothing for a line the server gave no id (old server: no button either)", () => {
    expect(queuedRecallRefusalShown(refusal, "steer", undefined)).toBeNull();
  });

  it("draws nothing when the last attempt was not refused at all", () => {
    expect(queuedRecallRefusalShown(null, "steer", "steer-1")).toBeNull();
  });
});

describe("queuedRecallRefusalHosted", () => {
  const steering = [{ id: "s-1" }, { id: undefined }];
  const followUps = [{ id: "f-1" }];

  it("holds while the entry is still in its own queue", () => {
    expect(
      queuedRecallRefusalHosted(
        queuedRecallRefused("steer", "s-1", new Error("x")),
        steering,
        followUps,
      ),
    ).toBe(true);
    expect(
      queuedRecallRefusalHosted(
        queuedRecallRefused("followUp", "f-1", new Error("x")),
        steering,
        followUps,
      ),
    ).toBe(true);
  });

  it("lets go the moment the entry is gone (delivered, sent, or recalled elsewhere)", () => {
    expect(
      queuedRecallRefusalHosted(
        queuedRecallRefused("steer", "s-9", new Error("x")),
        steering,
        followUps,
      ),
    ).toBe(false);
    expect(
      queuedRecallRefusalHosted(
        queuedRecallRefused("followUp", "f-9", new Error("x")),
        steering,
        followUps,
      ),
    ).toBe(false);
  });

  it("is not hosted by the other queue's entry of the same id", () => {
    expect(
      queuedRecallRefusalHosted(
        queuedRecallRefused("followUp", "s-1", new Error("x")),
        steering,
        followUps,
      ),
    ).toBe(false);
  });
});
