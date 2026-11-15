/**
 * action-press.ts: what a press on the lightbox's action bar leaves for the overlay to do. The
 * cases that matter are the ones the bar cannot show by itself — an action that answers with a
 * promise keeps the overlay up, and the sentence it resolves to is a refusal drawn under the bar
 * (the picture is the only place the press and its reason are both in view); everything else, a
 * plain action, an empty answer and one that never answers, closes it.
 */
import { describe, expect, it, vi } from "vitest";
import { pressLightboxAction } from "../src/components/overlays/lightbox/action-press";
import type { ActionPress } from "../src/components/overlays/lightbox/action-press";

/** A report sink that records every state the press went through, in order. */
function recorder() {
  const seen: ActionPress[] = [];
  return { seen, report: (press: ActionPress) => seen.push(press) };
}

/** Let the promise the action returned run to its `then`. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("pressLightboxAction", () => {
  it("runs a plain action and reports it finished, with nothing left to say", () => {
    const work = vi.fn();
    const { seen, report } = recorder();
    pressLightboxAction(work, report);
    expect(work).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ kind: "done" }]);
  });

  it("calls the action before reporting, so the report can act on what it did", () => {
    const { seen, report } = recorder();
    let ran = false;
    pressLightboxAction(() => {
      ran = true;
    }, report);
    expect(ran).toBe(true);
    expect(seen).toEqual([{ kind: "done" }]);
  });

  it("marks an answering action pending first, then closes on an empty answer", async () => {
    const { seen, report } = recorder();
    pressLightboxAction(() => Promise.resolve(null), report);
    // Pending arrives synchronously: the overlay must not flicker shut while the work is running.
    expect(seen).toEqual([{ kind: "pending" }]);
    await settle();
    expect(seen).toEqual([{ kind: "pending" }, { kind: "done" }]);
  });

  it("draws the sentence an answering action resolves to, and keeps the overlay up", async () => {
    const { seen, report } = recorder();
    pressLightboxAction(
      () => Promise.resolve("没能把这张图拆成图层：服务器内部错误，请稍后重试。"),
      report,
    );
    await settle();
    expect(seen).toEqual([
      { kind: "pending" },
      { kind: "refused", text: "没能把这张图拆成图层：服务器内部错误，请稍后重试。" },
    ]);
  });

  it("treats a resolved empty string as finished rather than as a refusal to draw", async () => {
    const { seen, report } = recorder();
    pressLightboxAction(() => Promise.resolve(""), report);
    await settle();
    expect(seen).toEqual([{ kind: "pending" }, { kind: "done" }]);
  });

  it("closes when the action's promise rejects without words of its own", async () => {
    const { seen, report } = recorder();
    pressLightboxAction(() => Promise.reject(new Error("boom")), report);
    await settle();
    expect(seen).toEqual([{ kind: "pending" }, { kind: "done" }]);
  });

  it("waits for a promise-like answer as well, not only a real Promise", async () => {
    const { seen, report } = recorder();
    pressLightboxAction(
      () =>
        ({
          then: (onDone: (value: string | null) => void) => onDone("被拒了"),
        }) as unknown as Promise<string | null>,
      report,
    );
    expect(seen).toEqual([{ kind: "pending" }]);
    await settle();
    expect(seen).toEqual([{ kind: "pending" }, { kind: "refused", text: "被拒了" }]);
  });
});
