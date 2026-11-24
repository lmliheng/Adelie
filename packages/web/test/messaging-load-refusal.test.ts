/**
 * The messaging editor's failed initial read (src/features/messaging/messaging-load-refusal.ts):
 * whose words the sentence uses, and which host still gets a toast.
 *
 * Two hosts open the same editor. The dialog closes on a failed load, so its reason is the toast;
 * the conversation's Messaging panel stays open and draws the sentence itself where the form
 * would be — announcing it there AND as a toast would be two copies, one of which erases itself
 * while the panel goes on showing the other.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { messagingLoadRefusal } from "../src/features/messaging/messaging-load-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("messagingLoadRefusal", () => {
  it("reads a refused read through its code, so the line is the localized one", () => {
    const { text } = messagingLoadRefusal(
      new ApiError(404, "session_not_found", "RAW ENGLISH SERVER MESSAGE"),
    );
    expect(text).toBe(S.messaging.loadRefused(S.errors.byCode["session_not_found"] as string));
    expect(text).not.toContain("RAW ENGLISH SERVER MESSAGE");
  });

  it("keeps the toast for a host that does not draw the sentence", () => {
    // The dialog: it closes on the failure, so a notification is all its reader can be left.
    const refusal = messagingLoadRefusal(new Error("network down"));
    expect(refusal.text).toBe(S.messaging.loadRefused("network down"));
    expect(refusal.toast).toBe(refusal.text);
  });

  it("leaves the toast alone once the host says it draws the sentence itself", () => {
    // The dock panel: it keeps the line on screen and offers a retry under it.
    const refusal = messagingLoadRefusal(new Error("network down"), { saysInPlace: true });
    expect(refusal.text).toBe(S.messaging.loadRefused("network down"));
    expect(refusal.toast).toBeNull();
  });

  it("still says something when the failure carries nothing to say", () => {
    const { text } = messagingLoadRefusal(undefined, { saysInPlace: true });
    expect(text).toBe(S.messaging.loadRefused(S.common.unknownError));
    expect(messagingLoadRefusal(new Error("   ")).text).toBe(
      S.messaging.loadRefused(S.common.unknownError),
    );
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    expect(messagingLoadRefusal(new Error("network down")).text).toBe(
      "Could not read this conversation's remote-control settings: network down",
    );
    setActiveStrings(ZH);
    expect(messagingLoadRefusal(new Error("network down")).text).toBe(
      "读不到这个对话的远程控制设置：network down",
    );
  });
});
