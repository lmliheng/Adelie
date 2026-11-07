/**
 * The messaging card's test-message line (src/features/messaging/messaging-test-message-refusal.ts):
 * whose words the sentence uses, and which failures are allowed to say "it did not go out".
 *
 * The button sends one fixed line into the known chat and writes nothing, so a refusal leaves the
 * card exactly as it was — this line is the only account of the press once the six-second
 * notification is gone. The cases below are the shapes the failure comes in: the platform's
 * refusal (its own words are the actionable half), a route that refused to try, a request that was
 * itself rejected, and the one shape whose claim must be weaker — a request that never came back,
 * where nobody on this side can tell whether the chat received the message.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { messagingTestMessageRefusal } from "../src/features/messaging/messaging-test-message-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("messagingTestMessageRefusal", () => {
  it("keeps the platform's own words when the send was refused", () => {
    // 502 `<channel>_send_failed` carries the connector's detail: the bot is no longer in the
    // chat, QQ's reply window has passed, a scope was revoked. The code's sentence only says
    // "sending failed", which the button already said.
    const line = messagingTestMessageRefusal(
      new ApiError(502, "feishu_send_failed", "Bot is not a member of this chat."),
    );
    expect(line).toBe(S.messaging.testMessageRefused("Bot is not a member of this chat."));
    expect(line).not.toBe(
      S.messaging.testMessageRefused(S.errors.byCode["feishu_send_failed"] as string),
    );
  });

  it("still says something when the platform's refusal has no detail", () => {
    expect(messagingTestMessageRefusal(new ApiError(502, "telegram_send_failed", "   "))).toBe(
      S.messaging.testMessageRefused(S.errors.byCode["telegram_send_failed"] as string),
    );
    // A channel whose code the table does not know (only Feishu and Telegram have one) and whose
    // detail is empty would otherwise resolve to an empty line.
    expect(messagingTestMessageRefusal(new ApiError(502, "qq_send_failed", ""))).toBe(
      S.messaging.testMessageRefused(S.common.unknownError),
    );
  });

  it("keeps the platform's detail for a channel whose code has no sentence of its own", () => {
    // QQ's 502 forwards the connector's own message (its minute-long reply window is what a
    // reader needs), and the error table has no `qq_send_failed` to read instead.
    expect(
      messagingTestMessageRefusal(new ApiError(502, "qq_send_failed", "reply window passed")),
    ).toBe(S.messaging.testMessageRefused("reply window passed"));
  });

  it("reads a route that refused to try through its code, not the wire message", () => {
    // 409 `<channel>_no_chat`: the chat the button relied on is gone. The interface has its own
    // sentence for it — "message the bot once first" — and the server's English is not it.
    const line = messagingTestMessageRefusal(
      new ApiError(409, "feishu_no_chat", "No Feishu chat is known yet: message the bot once."),
    );
    expect(line).toBe(S.messaging.testMessageRefused(S.errors.byCode["feishu_no_chat"] as string));
    expect(line).not.toContain("No Feishu chat is known yet");
  });

  it("reads a rejected request through its code as well", () => {
    const line = messagingTestMessageRefusal(
      new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"),
    );
    expect(line).toBe(S.messaging.testMessageRefused(S.errors.byCode["internal"] as string));
    expect(line).not.toContain("RAW ENGLISH SERVER MESSAGE");
  });

  it("does not claim the message was not sent when no answer came back", () => {
    // The client raises a status-0 `network_error` when the exchange never completed: the server
    // may have delivered the message and only its answer was lost. Saying "it did not go out"
    // would send a second copy into a chat that already holds the first.
    const network = new ApiError(0, "network_error", S.errors.networkError);
    expect(messagingTestMessageRefusal(network)).toBe(
      S.messaging.testMessageUnconfirmed(S.errors.networkError),
    );
    expect(messagingTestMessageRefusal(network)).not.toBe(
      S.messaging.testMessageRefused(S.errors.networkError),
    );
    // An answer this side could not read at all is the same kind of unknown.
    expect(messagingTestMessageRefusal(new SyntaxError("Unexpected end of JSON input"))).toBe(
      S.messaging.testMessageUnconfirmed("Unexpected end of JSON input"),
    );
  });

  it("still says something when an unanswered request carries nothing to say", () => {
    expect(messagingTestMessageRefusal(undefined)).toBe(
      S.messaging.testMessageUnconfirmed(S.common.unknownError),
    );
    expect(messagingTestMessageRefusal(new Error("   "))).toBe(
      S.messaging.testMessageUnconfirmed(S.common.unknownError),
    );
    expect(messagingTestMessageRefusal(new ApiError(0, "network_error", ""))).toBe(
      S.messaging.testMessageUnconfirmed(S.common.unknownError),
    );
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    expect(
      messagingTestMessageRefusal(new ApiError(502, "telegram_send_failed", "Forbidden")),
    ).toBe("The test message did not go out: Forbidden");
    expect(messagingTestMessageRefusal(new Error("network down"))).toContain(
      "Could not confirm whether the test message arrived: network down",
    );
    setActiveStrings(ZH);
    expect(
      messagingTestMessageRefusal(new ApiError(502, "telegram_send_failed", "Forbidden")),
    ).toBe("测试消息没有发出去：Forbidden");
  });
});
