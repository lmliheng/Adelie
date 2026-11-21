/**
 * The sentence a channel keeps under its "Earlier days" button after a day file did not come
 * back (src/features/company/channel-earlier-refusal.ts).
 *
 * Same shape as every other refusal slot in the app (7.19): the interface's own lead-in plus the
 * reason — localized from the code where the dictionary has words for it, and the server's own
 * sentence otherwise. Organization reads answer in codes this app mostly has none for, so the
 * fallback carries real work. A failure with nothing to say still gets the generic sentence, and
 * the lead-in follows the active interface language.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { channelEarlierRefusalLine } from "../src/features/company/channel-earlier-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("channelEarlierRefusalLine", () => {
  it("prefers the dictionary's sentence for a code it does know", () => {
    const text = channelEarlierRefusalLine(new ApiError(500, "internal", "the day file is locked"));
    expect(text).toBe(S.company.channels.earlierRefused(S.errors.byCode.internal as string));
    expect(text).not.toContain("locked");
    expect(text.startsWith("更早的记录没有取到：")).toBe(true);
  });

  it("keeps the server's own words for a code the dictionary does not know", () => {
    const text = channelEarlierRefusalLine(
      new ApiError(404, "channel_not_found", "Channel site is not in organization acme."),
    );
    expect(text).toBe(
      S.company.channels.earlierRefused("Channel site is not in organization acme."),
    );
  });

  it("keeps a sentence the app raised itself, before any request was sent", () => {
    const text = channelEarlierRefusalLine(new Error("这个频道已经不在组织里了。"));
    expect(text).toBe(S.company.channels.earlierRefused("这个频道已经不在组织里了。"));
  });

  it("falls back to the generic sentence when the failure has nothing to say", () => {
    expect(channelEarlierRefusalLine(undefined)).toBe(
      S.company.channels.earlierRefused(S.common.unknownError),
    );
  });

  it("speaks the active interface language, lead-in included", () => {
    setActiveStrings(EN);
    const text = channelEarlierRefusalLine(new ApiError(500, "internal", "kaboom at the store"));
    expect(text).toBe(EN.company.channels.earlierRefused(EN.errors.byCode.internal as string));
    expect(text.startsWith("Earlier days could not be loaded: ")).toBe(true);
  });
});
