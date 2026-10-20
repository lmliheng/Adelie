/**
 * The model library's write verdict (features/models/write-outcome.ts): a refusal carries the
 * server's words to the card that asked for the write, a written change carries nothing.
 */
import { describe, expect, it } from "vitest";
import { refusalOf } from "../src/features/models/write-outcome";
import type { WriteOutcome } from "../src/features/models/write-outcome";

describe("write outcome", () => {
  it("hands a refusal's words to the card, and only the refusal", () => {
    expect(refusalOf({ ok: false, reason: "models store is closed" })).toBe(
      "models store is closed",
    );
  });

  it("says nothing to place for a written change", () => {
    expect(refusalOf({ ok: true })).toBeNull();
  });

  it("keeps the words as the server gave them", () => {
    // The reason is shown, not re-worded: every call site renders exactly this string.
    const reason = "分组 probegroup 仍然有 2 个模型，不能删除";
    const outcome: WriteOutcome = { ok: false, reason };
    expect(refusalOf(outcome)).toBe(reason);
  });
});
