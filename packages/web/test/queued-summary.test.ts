/**
 * The queued-message summary line (features/chat/queued-summary.ts): what a "steering queued" or
 * "follow-up queued" hint shows for a message whose content the text alone does not describe.
 *
 * The counts are the whole point — a clip that rode a steered message is invisible in its text, and
 * a summary that dropped it would leave the user reading a queued line about a message that was
 * more than what they see. Written against the live dictionary rather than a literal, like the
 * rest of the copy: the wording is S's to change.
 */
import { describe, expect, it } from "vitest";
import { steeringSummary } from "../src/features/chat/queued-summary";
import { S } from "../src/lib/strings";

const summary = (over: Partial<Parameters<typeof steeringSummary>[0]> = {}) =>
  steeringSummary({ text: "", images: 0, videos: 0, files: 0, ...over });

describe("steeringSummary", () => {
  it("leads with the text, one line's worth", () => {
    expect(summary({ text: "  hold   on\nplease " })).toBe("hold on please");
  });

  it("names each kind of attachment the text cannot show, in one line", () => {
    expect(summary({ text: "look", images: 2, videos: 1, files: 3 })).toBe(
      `look \u00b7 ${S.chat.imagesInMessage(2)} \u00b7 ${S.chat.videosInMessage(1)} \u00b7 ${S.chat.filesInMessage(3)}`,
    );
  });

  it("shows a clip count on its own — a video-only steer is a complete message", () => {
    expect(summary({ videos: 2 })).toBe(S.chat.videosInMessage(2));
  });

  it("leaves out the kinds the message does not carry", () => {
    expect(summary({ text: "hi", images: 0, videos: 0, files: 0 })).toBe("hi");
    expect(summary({ text: "hi", videos: 0 })).toBe("hi");
    expect(summary()).toBe("");
  });
});
