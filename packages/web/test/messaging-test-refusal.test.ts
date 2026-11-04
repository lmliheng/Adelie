/**
 * The messaging card's "test connection" line (src/features/messaging/messaging-test-refusal.ts):
 * which answers leave a sentence under the button, and whose words that sentence uses.
 *
 * A refused probe changes nothing else on the card — the form keeps every value it was asked with
 * — so this line is the only thing that accounts for the failure once the six-second toast is gone.
 * The cases below are the three shapes the answer comes in plus the two languages, and the rule
 * that matters most: a probe that connected leaves nothing behind.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import type { FeishuTestResponse, TelegramTestResponse } from "@adelie/server/api";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { messagingTestRefusal } from "../src/features/messaging/messaging-test-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("messagingTestRefusal", () => {
  it("leaves no line when the probe connected", () => {
    // Typed as the route's own answer, so the extra success fields (the toast's latency, the bot
    // name, the Group Privacy caveat) are the shapes the line is deliberately blind to.
    const connected: FeishuTestResponse = { ok: true, latencyMs: 12 };
    expect(messagingTestRefusal({ result: connected })).toBeNull();
    const telegram: TelegramTestResponse = {
      ok: true,
      latencyMs: 8,
      botUsername: "@probe_bot",
      groupPrivacy: true,
    };
    expect(messagingTestRefusal({ result: telegram })).toBeNull();
  });

  it("carries the platform's own detail verbatim, behind the sentence's lead-in", () => {
    // What the routes send when Telegram rejects the token, or a base domain refuses the dial.
    expect(messagingTestRefusal({ result: { ok: false, error: "Unauthorized" } })).toBe(
      S.messaging.testFail("Unauthorized"),
    );
  });

  it("still says something when the route refused without a detail", () => {
    // An empty line under the button would say less than the toast it replaced.
    expect(messagingTestRefusal({ result: { ok: false } })).toBe(
      S.messaging.testFail(S.common.unknownError),
    );
  });

  it("reads a failed request through its code, so the line is the localized one", () => {
    const refused = messagingTestRefusal({
      result: null,
      error: new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"),
    });
    expect(refused).toBe(S.messaging.testFail(S.errors.byCode["internal"] as string));
    expect(refused).not.toContain("RAW ENGLISH SERVER MESSAGE");
  });

  it("keeps the message of an error the client itself raised", () => {
    // `refusalText`'s rule: only an ApiError goes through the code table; anything else with
    // something to say is shown as it is (a dropped connection, say), not as "unknown".
    expect(messagingTestRefusal({ result: null, error: new Error("network down") })).toBe(
      S.messaging.testFail("network down"),
    );
    expect(messagingTestRefusal({ result: null, error: undefined })).toBe(
      S.messaging.testFail(S.common.unknownError),
    );
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    expect(messagingTestRefusal({ result: { ok: false, error: "Unauthorized" } })).toBe(
      "Connection failed: Unauthorized",
    );
  });
});
