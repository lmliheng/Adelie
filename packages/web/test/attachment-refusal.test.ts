/**
 * The composer's oversize refusal (src/features/chat/attachment-refusal.ts): the sentence the
 * input leaves above its card when a pick, a paste or a drop carried a file over a ceiling.
 *
 * The refusal is what makes this function worth pinning: nothing was added, so the only evidence
 * on screen is this line, and it has to name every file that was turned away and the number it was
 * measured against. The two hard halves are the batch (one sentence per ceiling, files named under
 * it, still in picking order) and the language (names are joined and the sentence written by the
 * active dictionary, not by a `join` this module spelled out).
 */
import { afterEach, describe, expect, it } from "vitest";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { attachmentRefusalLine } from "../src/features/chat/attachment-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("attachmentRefusalLine", () => {
  it("says nothing when the intake refused nothing", () => {
    // Also the clear: the slot is set from every intake, so an empty batch empties the line.
    expect(attachmentRefusalLine([])).toBeNull();
  });

  it("names the one file and the ceiling it was measured against", () => {
    expect(attachmentRefusalLine([{ name: "report.pdf", limitMb: 100 }])).toBe(
      S.chat.attachmentTooLarge(["report.pdf"], 100),
    );
  });

  it("names every file of a batch refused against the same ceiling, in picking order", () => {
    const line = attachmentRefusalLine([
      { name: "shot.png", limitMb: 20 },
      { name: "diagram.png", limitMb: 20 },
    ]);
    // One sentence naming both, not one sentence per file.
    expect(line).toBe(S.chat.attachmentTooLarge(["shot.png", "diagram.png"], 20));
    expect(line).toContain(S.chat.attachmentTooLarge(["shot.png"], 20).replace("shot.png", ""));
  });

  it("keeps one sentence per ceiling when a pick refused files against two of them", () => {
    // Drag-and-drop hands images and clips to the same intake: two ceilings, two sentences.
    const line = attachmentRefusalLine([
      { name: "shot.png", limitMb: 20 },
      { name: "clip.mp4", limitMb: 32 },
      { name: "wallpaper.png", limitMb: 20 },
    ]);
    expect(line).toBe(
      [
        S.chat.attachmentTooLarge(["shot.png", "wallpaper.png"], 20),
        S.chat.attachmentTooLarge(["clip.mp4"], 32),
      ].join(" "),
    );
  });

  it("writes the sentence and the separator in the active language", () => {
    setActiveStrings(EN);
    const line = attachmentRefusalLine([
      { name: "shot.png", limitMb: 20 },
      { name: "diagram.png", limitMb: 20 },
    ]);
    expect(line).toBe(EN.chat.attachmentTooLarge(["shot.png", "diagram.png"], 20));
    expect(line).toContain("limit");
    expect(line).not.toContain("超过");
  });
});
