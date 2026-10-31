/**
 * The pure parts of the theme import (features/settings/theme-import.ts): what a failed import
 * says, which of its answers are a refusal rather than a question, and the check the browser makes
 * before reading a picked file.
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
  themeImportRefusal,
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

  it("主题库导入的四个码也在同一张表上", () => {
    expect(themeImportErrorText(new ApiError(404, "registry_theme_not_found", "…"))).toBe(
      S.settings.themeRegistryGone,
    );
    expect(themeImportErrorText(new ApiError(400, "registry_mismatch", "…"))).toBe(
      S.settings.themeRegistryMismatch,
    );
    expect(themeImportErrorText(new ApiError(400, "registry_unusable", "…"))).toBe(
      S.settings.themeRegistryUnusable,
    );
    expect(themeImportErrorText(new ApiError(400, "registry_unavailable", "…"))).toBe(
      S.settings.themeRegistryFailed,
    );
    // The index reader's own reasons survive, as `theme_invalid`'s do.
    expect(
      themeImportErrorText(new ApiError(400, "registry_invalid", "themes[0].file: 「../x」不是")),
    ).toBe(S.settings.themeRegistryInvalid("themes[0].file: 「../x」不是"));
  });

  it("不认识的码走共用的那张表，不是自己编一句", () => {
    const empty = new ApiError(400, "bad_request", "The file is empty.");
    expect(themeImportErrorText(empty)).toBe(apiErrorText(empty));
    // Not an ApiError at all (a thrown non-HTTP failure): the shared text, not a crash or a blank.
    expect(themeImportErrorText(new Error("boom"))).toBe(S.common.unknownError);
  });
});

describe("拒绝与「问题」的分界", () => {
  it("409 theme_exists 是问题，不是拒绝：调用方拿 null 去开覆盖确认", () => {
    expect(themeImportRefusal(new ApiError(409, "theme_exists", "…"))).toBeNull();
  });

  it("其余一律是拒绝，且就是那句与失败同一个表里的话", () => {
    // A code with its own copy: the localized sentence, so a reader who is on 中文 is not shown the
    // server's English.
    expect(themeImportRefusal(new ApiError(404, "registry_theme_not_found", "…"))).toBe(
      S.settings.themeRegistryGone,
    );
    expect(themeImportRefusal(new ApiError(400, "download_failed", "…"))).toBe(
      S.settings.themeImportDownloadFailed,
    );
    // A code nobody localized still says something: the shared mapping, never an empty line.
    const odd = new ApiError(500, "something_new", "it broke");
    expect(themeImportRefusal(odd)).toBe(apiErrorText(odd));
    expect(themeImportRefusal(odd)).not.toBe("");
    expect(themeImportRefusal(new Error("boom"))).toBe(S.common.unknownError);
  });

  it("409 别的码不是问题：它没有覆盖确认可开，仍按拒绝说", () => {
    // `theme_exists` is the one 409 the flows ask about; a conflict from anywhere else has no card
    // to open, so it must not vanish into a silent null.
    const other = new ApiError(409, "conflict", "…");
    expect(themeImportRefusal(other)).toBe(apiErrorText(other));
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
