/**
 * The two pure parts of the theme import dialog (features/settings/theme-import.ts): what a failed
 * import says, and the check the browser makes before reading a picked file.
 *
 * What is worth pinning here is that a refusal is never replaced by a sentence of the app's own
 * when the server had something specific to say: `theme_invalid` carries the reader's collected
 * reasons — the file's author is who has to fix them — while a code the app has its own copy for
 * gets that copy, because the server's message is English-only and the UI language may not be.
 * The cap is pinned against core's own constant: the browser refusing to read a file the server
 * would accept, or reading one it would refuse, is the one way these two numbers can disagree.
 */
import { describe, expect, it } from "vitest";
import { MAX_THEME_FILE_BYTES } from "@adelie/core";
import { ApiError } from "../src/api/client";
import { apiErrorText } from "../src/lib/api-error";
import { S } from "../src/lib/strings";
import {
  THEME_FILE_LIMIT_KB,
  themeFileTooLarge,
  themeImportErrorText,
} from "../src/features/settings/theme-import";

describe("主题导入失败时说的话", () => {
  it("读不出来时，服务端给的原因原样带上", () => {
    const reason = "id: 「Warm Paper」不是合法的主题名（要小写字母开头…）";
    const text = themeImportErrorText(new ApiError(400, "theme_invalid", reason));
    expect(text).toBe(S.settings.themeImportInvalid(reason));
    // The reason itself survives into the sentence rather than being summarized away.
    expect(text).toContain("Warm Paper");
  });

  it("每个码都有自己的说法：超限、地址不对、内网、取不回来", () => {
    expect(themeImportErrorText(new ApiError(413, "theme_too_large", "…"))).toBe(
      S.settings.themeImportTooLarge,
    );
    expect(themeImportErrorText(new ApiError(400, "unsupported_url", "…"))).toBe(
      S.settings.themeImportBadUrl,
    );
    expect(
      themeImportErrorText(
        new ApiError(
          400,
          "blocked_url",
          "Refusing to fetch from a local or private host: 127.0.0.1",
        ),
      ),
    ).toBe(S.settings.themeImportBlockedUrl);
    expect(themeImportErrorText(new ApiError(400, "download_failed", "…"))).toBe(
      S.settings.themeImportDownloadFailed,
    );
  });

  it("不认识的码走共用的那张表，不是自己编一句", () => {
    const empty = new ApiError(400, "bad_request", "The file is empty.");
    expect(themeImportErrorText(empty)).toBe(apiErrorText(empty));
    // Not an ApiError at all (a thrown non-HTTP failure): the shared text, not a crash or a blank.
    expect(themeImportErrorText(new Error("boom"))).toBe(S.common.unknownError);
  });
});

describe("读取之前的那道上限", () => {
  it("浏览器这边的上限就是 core 的格式上限", () => {
    expect(THEME_FILE_LIMIT_KB * 1024).toBe(MAX_THEME_FILE_BYTES);
  });

  it("按文件大小判断，正好到上限时不拦", () => {
    expect(themeFileTooLarge(THEME_FILE_LIMIT_KB * 1024)).toBe(false);
    expect(themeFileTooLarge(THEME_FILE_LIMIT_KB * 1024 + 1)).toBe(true);
  });
});
