/**
 * The messaging card's save line (src/features/messaging/messaging-save-refusal.ts): whose words
 * the sentence uses, and that it never comes back empty.
 *
 * A refused save changes nothing else on the card — the fields keep every value, the baseline does
 * not move, and the success toast never comes — so this line is the only thing that accounts for
 * the failure once the six-second notification is gone. The cases below are the shapes the failure
 * comes in plus the two languages.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { messagingSaveRefusal } from "../src/features/messaging/messaging-save-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("messagingSaveRefusal", () => {
  it("reads a refused write through its code, so the line is the localized one", () => {
    const line = messagingSaveRefusal(new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"));
    expect(line).toBe(S.messaging.saveRefused(S.errors.byCode["internal"] as string));
    expect(line).not.toContain("RAW ENGLISH SERVER MESSAGE");
    expect(line.startsWith(S.messaging.saveRefused(""))).toBe(true);
  });

  it("carries a server code the map knows in its own words", () => {
    // The shape a refused credential write actually arrives in: the message is English, the code
    // is what the interface has a sentence for.
    const line = messagingSaveRefusal(
      new ApiError(409, "account_enabled_elsewhere", "Another Session has this bot enabled."),
    );
    expect(line).toBe(
      S.messaging.saveRefused(S.errors.byCode["account_enabled_elsewhere"] as string),
    );
    expect(line).not.toContain("Another Session has this bot enabled.");
  });

  it("keeps the message of an error the client itself raised", () => {
    // `refusalText`'s rule: only an ApiError goes through the code table; anything else with
    // something to say is shown as it is (a dropped connection, say), not as "unknown".
    expect(messagingSaveRefusal(new Error("network down"))).toBe(
      S.messaging.saveRefused("network down"),
    );
  });

  it("still says something when the failure carries nothing to say", () => {
    // An empty line above Save would say less than the toast it replaced.
    expect(messagingSaveRefusal(undefined)).toBe(S.messaging.saveRefused(S.common.unknownError));
    expect(messagingSaveRefusal(new Error("   "))).toBe(
      S.messaging.saveRefused(S.common.unknownError),
    );
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    expect(messagingSaveRefusal(new Error("network down"))).toBe("Save failed: network down");
    setActiveStrings(ZH);
    expect(messagingSaveRefusal(new Error("network down"))).toBe("保存失败：network down");
  });
});
