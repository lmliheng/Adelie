/**
 * How the ledger page names its three background failures: the walk that could not be read
 * (`report`), the read of the mode — and with it the trash and the bills — (`state`), and a scan
 * the server refused (`scan`).
 *
 * Each of the three used to leave a sentence without the reason and a toast with it, so six
 * seconds later the page said "could not read" and nothing more. These cases pin the two things
 * that sentence has to do:
 *
 * - say which of the three promises went unanswered (they are drawn in three different places, and
 *   "the storage page failed" would not tell a reader which control to press again);
 * - carry the reason as it was handed over — `refusalText` has already localized what it could.
 */
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { storageFailureText } from "../src/features/settings/storage-failure";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("storageFailureText", () => {
  it("names the measurement that could not be read", () => {
    expect(storageFailureText("report", "Internal server error")).toBe(
      "无法取得存储报告：Internal server error",
    );
  });

  it("says the mode was unread and that the page treats it as off, which is what it does", () => {
    // The sentence is also the account of why every gated control below it is inert: the page
    // guessed "off", so the reason has to travel with that guess.
    expect(storageFailureText("state", "Internal server error")).toBe(
      "无法读取清理模式设置，因此按「已关闭」处理：Internal server error",
    );
  });

  it("keeps the scan's own consequence: no bill to review", () => {
    expect(storageFailureText("scan", "Internal server error")).toBe(
      "扫描失败，没有可以审阅的账单：Internal server error",
    );
  });

  it("carries the reason verbatim, punctuation and all", () => {
    // `refusalText` already localized what it could; whatever it hands over is what is drawn.
    expect(storageFailureText("report", "服务器内部错误，请稍后重试。")).toBe(
      "无法取得存储报告：服务器内部错误，请稍后重试。",
    );
  });

  it("tells the three failures apart", () => {
    // Same reason, three sentences: a reader looking at the switch must not be told the walk failed.
    const texts = (["report", "state", "scan"] as const).map((failure) =>
      storageFailureText(failure, "nope"),
    );
    expect(new Set(texts).size).toBe(3);
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    expect(S.settings.storageFailed("nope")).toBe("Could not read the storage report: nope");
    expect(S.settings.storageModeFailed("nope")).toBe(
      "Could not read the cleanup mode's settings, so this page treats it as off: nope",
    );
    expect(S.settings.storageScanFailed("nope")).toBe(
      "The scan failed, so there is no bill to review: nope",
    );
  });
});
