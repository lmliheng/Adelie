/**
 * The scan-to-connect card's refusal line (src/features/messaging/scan-refusal.tsx): which of the
 * flow's answers go on the card, and whose words the sentence uses.
 *
 * A failed scan changes nothing else on the card — the code comes down (or WeChat's pairing-code
 * input stays up) and the button that asks again is still there — so this line is the only thing
 * that accounts for the failure once the six-second toast is gone. The cases below are the three
 * shapes a failed request comes in, the two channels' own lead-ins, and the one answer that is
 * news rather than a fault.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { scanStartRefusal, scanStopRefusal } from "../src/features/messaging/scan-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("scanStartRefusal", () => {
  it("reads a failed request through its code, so the line is the localized one", () => {
    // The scan route answers a platform it cannot reach with its own code; the server's message is
    // English whatever the interface language is.
    const refused = scanStartRefusal(
      S.qq.scanFailed,
      new ApiError(502, "internal", "RAW ENGLISH SERVER MESSAGE"),
    );
    expect(refused).toBe(S.qq.scanFailed(S.errors.byCode["internal"] as string));
    expect(refused).not.toContain("RAW ENGLISH SERVER MESSAGE");
  });

  it("keeps the message of an error the client itself raised", () => {
    // `refusalText`'s rule: only an ApiError goes through the code table; anything else with
    // something to say is shown as it is, not as "unknown".
    expect(scanStartRefusal(S.qq.scanFailed, new Error("network down"))).toBe(
      S.qq.scanFailed("network down"),
    );
    expect(scanStartRefusal(S.qq.scanFailed, undefined)).toBe(
      S.qq.scanFailed(S.common.unknownError),
    );
  });

  it("speaks each channel's own lead-in, in the interface language", () => {
    const error = new Error("network down");
    // The two cards say the same thing in their own words, which is why the sentence comes in as
    // the channel's builder rather than from a table here. (In Chinese the two lead-ins happen to
    // read alike; in English they do not, so the difference is asserted where it exists.)
    expect(scanStartRefusal(S.wechat.scanFailed, error)).toBe(S.wechat.scanFailed("network down"));
    setActiveStrings(EN);
    expect(scanStartRefusal(S.qq.scanFailed, error)).toBe("Scan-to-connect failed: network down");
    expect(scanStartRefusal(S.wechat.scanFailed, error)).toBe(
      "Connecting by scan failed: network down",
    );
  });
});

describe("scanStopRefusal", () => {
  it("keeps a fault on the card", () => {
    // QQ's stops carry no tone at all: every one of them is a code that came down for nothing.
    expect(scanStopRefusal({ notice: S.qq.scanExpiredRepeatedly })).toBe(
      S.qq.scanExpiredRepeatedly,
    );
    expect(scanStopRefusal({ notice: S.wechat.scanBlocked, tone: "error" })).toBe(
      S.wechat.scanBlocked,
    );
  });

  it("leaves news to the toast", () => {
    // Nothing failed and there is nothing to retry: the bot was already connected, and a line
    // under the button would read as a fault to fix.
    expect(scanStopRefusal({ notice: S.wechat.scanAlreadyBound, tone: "info" })).toBeNull();
  });
});
