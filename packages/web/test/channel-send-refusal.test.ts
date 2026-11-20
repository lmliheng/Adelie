/**
 * The sentence a channel composer keeps above its box after a refused send
 * (src/features/company/channel-send-refusal.ts).
 *
 * The line is the app's own lead-in plus the reason: the code's localized sentence where the app
 * has words for it, and the server's own when it does not — which is the common case for channel
 * writes, since the organization service answers in codes (`channel_archived`, `not_a_member`)
 * that the dictionary never learned. A failure that never reached the route keeps what it knows,
 * and one with nothing to say falls back to the generic sentence. The lead-in itself follows the
 * active interface language, like every other refusal slot in the app.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { channelSendRefusalLine } from "../src/features/company/channel-send-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("channelSendRefusalLine", () => {
  it("keeps the server's own words for a code the dictionary does not know", () => {
    const text = channelSendRefusalLine(
      new ApiError(409, "channel_archived", "Channel site is archived: unarchive it first."),
    );
    expect(text).toBe(
      S.company.channels.sendRefused("Channel site is archived: unarchive it first."),
    );
    expect(text.startsWith("这条消息没有发出：")).toBe(true);
  });

  it("prefers the dictionary's sentence for a code it does know", () => {
    const text = channelSendRefusalLine(new ApiError(500, "internal", "kaboom at the store"));
    expect(text).toBe(S.company.channels.sendRefused(S.errors.byCode.internal as string));
    expect(text).not.toContain("kaboom");
  });

  it("keeps a sentence the app raised itself, before any request was sent", () => {
    const text = channelSendRefusalLine(new Error("这个频道已经不在组织里了。"));
    expect(text).toBe(S.company.channels.sendRefused("这个频道已经不在组织里了。"));
  });

  it("falls back to the generic sentence when the failure has nothing to say", () => {
    expect(channelSendRefusalLine(undefined)).toBe(
      S.company.channels.sendRefused(S.common.unknownError),
    );
  });

  it("speaks the active interface language, lead-in included", () => {
    setActiveStrings(EN);
    const text = channelSendRefusalLine(
      new ApiError(403, "not_a_member", "user:u1 is not a member of the channel site."),
    );
    expect(text).toBe(
      EN.company.channels.sendRefused("user:u1 is not a member of the channel site."),
    );
    expect(text.startsWith("This message did not go out: ")).toBe(true);
  });
});
