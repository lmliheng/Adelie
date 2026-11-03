/**
 * The save confirmation's verdict (`awaitSave`, features/agents/save-confirm-outcome.ts): only a
 * write that landed closes the card that asked for it, and a refusal carries the reason back so
 * that card can draw it under its own sentence.
 *
 * - A form with nothing to wait for (a caller that returns early) closes: `ok`.
 * - A write the server refused answers `ok: false` with the sentence every refusal slot reads —
 *   localized from the code, the server's raw English never reaching a Chinese UI.
 * - A sentence the codebase raised itself (the request never left) is shown as it stands.
 * - A value with nothing to say falls back to the generic failure, as everywhere else.
 * - The run is called exactly once: the card's Confirm is that single call, retried by pressing it
 *   again rather than by replaying anything here.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { awaitSave } from "../src/features/agents/save-confirm-outcome";
import { refusalOf } from "../src/features/models/write-outcome";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";

afterEach(() => {
  setActiveStrings(ZH);
});

/** A server refusal: the code decides the wording, the message stays the server's own English. */
const serverRefusal = (code: string): ApiError => new ApiError(409, code, "RAW SERVER MESSAGE");

describe("awaitSave", () => {
  it("closes on a landed write, synchronous or not", async () => {
    expect(await awaitSave(() => {})).toEqual({ ok: true });
    expect(await awaitSave(async () => {})).toEqual({ ok: true });
    expect(await awaitSave(() => Promise.resolve({ saved: true }))).toEqual({ ok: true });
  });

  it("keeps the card with the server's reason, localized from the code", async () => {
    for (const dict of [ZH, EN]) {
      setActiveStrings(dict);
      const outcome = await awaitSave(() => Promise.reject(serverRefusal("internal")));
      expect(outcome.ok).toBe(false);
      // The server's English message is not what a Chinese UI shows for a code it knows.
      expect(refusalOf(outcome)).not.toBe("RAW SERVER MESSAGE");
      expect(refusalOf(outcome)).toBe(S.errors.byCode.internal);
      // Which is what the card then draws behind its lead-in.
      expect(S.common.refused(refusalOf(outcome) ?? "")).toContain(S.errors.byCode.internal);
    }
  });

  it("passes an unmapped code through as the server worded it", async () => {
    const outcome = await awaitSave(() => Promise.reject(serverRefusal("nobody_mapped_this")));
    expect(refusalOf(outcome)).toBe("RAW SERVER MESSAGE");
  });

  it("shows a sentence the codebase raised itself as it stands", async () => {
    // A write the page refuses before sending (nothing to write, a missing id) has no server
    // answer to quote, and its own message is already meant for the user.
    const outcome = await awaitSave(() => {
      throw new Error("保存位置还没确定");
    });
    expect(refusalOf(outcome)).toBe("保存位置还没确定");
  });

  it("falls back to the generic failure when the value has nothing to say", async () => {
    expect(refusalOf(await awaitSave(() => Promise.reject({} as unknown as Error)))).toBe(
      S.common.unknownError,
    );
    expect(refusalOf(await awaitSave(() => Promise.reject(new Error("  "))))).toBe(
      S.common.unknownError,
    );
  });

  it("runs the caller's write exactly once", async () => {
    let runs = 0;
    const run = () => {
      runs += 1;
      return Promise.reject(serverRefusal("internal"));
    };
    await awaitSave(run);
    expect(runs).toBe(1);
  });
});
