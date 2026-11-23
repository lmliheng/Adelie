/**
 * The models page's platform sync refusal (src/features/models/platform-sync-refusal.ts): which
 * failures leave a sentence under the group header, and whose words it uses.
 *
 * A failed sync writes nothing — the rows, the default and the vision pointer are as they were —
 * so this line is the only thing accounting for the failure once the six-second toast is gone. The
 * cases below are the one code that is not a refusal (it opens the authorization flow) and the
 * two shapes every other answer takes, including one the page raises itself.
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S } from "../src/lib/strings";
import { platformSyncFailure } from "../src/features/models/platform-sync-refusal";

describe("platformSyncFailure", () => {
  it("hands a revoked key to the authorization flow instead of a sentence", () => {
    // The fix is a fresh authorization, and the page opens it: a sentence under the header would
    // name a key the reader can neither see nor retry from there.
    expect(
      platformSyncFailure(
        new ApiError(403, "platform_reauthorization_required", "RAW ENGLISH SERVER MESSAGE"),
      ),
    ).toEqual({ kind: "authorize" });
  });

  it("keeps the server's own words for every other answered failure", () => {
    // A 500 hands back the code's localized sentence rather than the raw body.
    expect(
      platformSyncFailure(new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE")),
    ).toEqual({ kind: "refused", text: "服务器内部错误，请稍后重试。" });
  });

  it("reads a value the page raised itself through refusalText", () => {
    // A failure before the request (no Project, a broken body) carries a sentence meant for the
    // reader; that one is not the generic "something went wrong".
    expect(platformSyncFailure(new Error("同步前先选一个 Project"))).toEqual({
      kind: "refused",
      text: "同步前先选一个 Project",
    });
    expect(platformSyncFailure(undefined)).toEqual({
      kind: "refused",
      text: S.common.unknownError,
    });
  });
});
