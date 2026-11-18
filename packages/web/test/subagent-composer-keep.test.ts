/**
 * What the subagent panel's child composer keeps outside itself
 * (src/features/chat/subagent-composer-keep.ts).
 *
 * The panel body is remounted whenever the layout moves it between the desktop right dock and the
 * narrow merged surface, so anything held in the composer's own state dies there — measured, before
 * this store existed: a draft typed into the box was gone after a resize across the breakpoint, and
 * so were the refusal lines that explained the last press. The rules this file pins are the ones
 * the store has to obey for that to be fixed without leaking: a child's record is its own, a
 * record with nothing in it is not kept at all, and reading a child nobody has written to answers
 * the same empty record every time (so a fresh mount always starts from something defined).
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_KEEP,
  readSubagentComposerKeep,
  writeSubagentComposerKeep,
} from "../src/features/chat/subagent-composer-keep";
import type { SubagentComposerKeep } from "../src/features/chat/subagent-composer-keep";
import type { ComposerReference } from "../src/lib/workspace-tree";

/** A record with every field spoken for — the shape a press leaves behind. */
const FULL: SubagentComposerKeep = {
  draft: "换布局前打的这一段",
  send: "没能把消息送到子会话：服务器内部错误，请稍后重试。",
  stop: "没能停下这个子会话的这次运行，它仍在继续：服务器内部错误，请稍后重试。",
  level: "没能钉住这个子会话的思考等级：服务器内部错误，请稍后重试。",
  pinnedLevel: "high",
  references: [
    { kind: "excerpt", excerpt: "Slow the TODO count down", text: "> Slow the TODO count down" },
  ],
};

describe("subagent composer keep", () => {
  it("reads an empty record for a child nobody has written to", () => {
    expect(readSubagentComposerKeep("child-never-seen")).toEqual(EMPTY_KEEP);
  });

  it("hands back what was written, for the child it was written for", () => {
    writeSubagentComposerKeep("child-a", FULL);
    expect(readSubagentComposerKeep("child-a")).toEqual(FULL);
  });

  it("keeps each child's record its own", () => {
    // Two children show at different times in the same panel; one child's refusal must never be
    // drawn over the other one's box.
    writeSubagentComposerKeep("child-x", { ...EMPTY_KEEP, stop: "x 仍在运行" });
    writeSubagentComposerKeep("child-y", { ...EMPTY_KEEP, stop: "y 仍在运行" });
    expect(readSubagentComposerKeep("child-x").stop).toBe("x 仍在运行");
    expect(readSubagentComposerKeep("child-y").stop).toBe("y 仍在运行");
  });

  it("replaces the record instead of accumulating sentences", () => {
    // The rule every one of these lines follows: the next press answers for itself, so the store
    // holds one record per child rather than a growing list of reasons.
    writeSubagentComposerKeep("child-replace", { ...EMPTY_KEEP, send: "第一次" });
    writeSubagentComposerKeep("child-replace", { ...EMPTY_KEEP, send: "第二次" });
    expect(readSubagentComposerKeep("child-replace")).toEqual({ ...EMPTY_KEEP, send: "第二次" });
  });

  it("drops the entry once nothing is left to say", () => {
    // Every line clears (the next attempt, the run ending, a pin landing then being withdrawn):
    // an empty record must not stay behind for a child that is never shown again.
    writeSubagentComposerKeep("child-cleared", FULL);
    writeSubagentComposerKeep("child-cleared", EMPTY_KEEP);
    expect(readSubagentComposerKeep("child-cleared")).toEqual(EMPTY_KEEP);
    // Reading it back cannot tell a dropped entry from a fresh one — which is the point: both are
    // the empty record a mount starts from.
    expect(readSubagentComposerKeep("child-cleared")).toBe(EMPTY_KEEP);
  });

  it("keeps the text in the box on its own", () => {
    // The debounced Session draft cache flushes on unmount, which is after the replacement mount
    // has already read the cache — so the remount reads the text from here.
    writeSubagentComposerKeep("child-typed", { ...EMPTY_KEEP, draft: "typing" });
    expect(readSubagentComposerKeep("child-typed").draft).toBe("typing");
  });

  it("keeps a pinned level on its own, without a sentence to go with it", () => {
    // A pin that landed writes `pinnedLevel` and nothing else; that alone is worth keeping across
    // the remount (the picker would otherwise fall back to the level the child merely inherited).
    writeSubagentComposerKeep("child-pinned", { ...EMPTY_KEEP, pinnedLevel: "low" });
    expect(readSubagentComposerKeep("child-pinned")).toEqual({ ...EMPTY_KEEP, pinnedLevel: "low" });
  });

  it("keeps staged reference chips on their own", () => {
    // The chips were staged by the child's own selection menu and nothing was sent, so a move
    // between docks must hand them back — they have no draft cache to fall back on, because a
    // quoted file may have moved on by the time storage is read again (chat-input.tsx).
    const quote: ComposerReference = {
      kind: "quote",
      path: "src/app.ts",
      text: "```ts\n1 | export const app = 1;\n```",
      fromLine: 1,
      toLine: 1,
    };
    writeSubagentComposerKeep("child-chips", { ...EMPTY_KEEP, references: [quote] });
    expect(readSubagentComposerKeep("child-chips")).toEqual({ ...EMPTY_KEEP, references: [quote] });
  });

  it("keeps each chip list in the order it was staged in", () => {
    // The chips are read top to bottom above the box, and the message carries them in that order:
    // a store that reordered them would put the sentences in a different order than the reader
    // arranged them.
    const dir: ComposerReference = { kind: "dir", path: "src", text: "@src/" };
    const file: ComposerReference = { kind: "file", path: "src/app.ts", text: "@src/app.ts" };
    writeSubagentComposerKeep("child-order", { ...EMPTY_KEEP, references: [dir, file] });
    expect(readSubagentComposerKeep("child-order").references).toEqual([dir, file]);
  });

  it("drops the entry once the last chip is gone", () => {
    // Removing the last chip is the sent clear and the × alike: from then on this child has
    // nothing staged, and the record must not survive as an empty shell.
    writeSubagentComposerKeep("child-unchips", {
      ...EMPTY_KEEP,
      references: [FULL.references[0]!],
    });
    writeSubagentComposerKeep("child-unchips", { ...EMPTY_KEEP, references: [] });
    expect(readSubagentComposerKeep("child-unchips")).toBe(EMPTY_KEEP);
  });
});
