/**
 * How the ledger names a refused settings write: the mode switch (`storageModeRefused`) and a
 * row's pin (`storagePinRefused`). Neither write moves optimistically — the switch shows the
 * position the server answered with, and the pin button still reads what it read before the click —
 * so a toast used to be the only account of a failure, and six seconds later the page looked as if
 * nothing had been pressed.
 *
 * - The mode's sentence names the direction that failed ("开启" / "关闭"), because the switch is
 *   still in the other position.
 * - The pin's sentence names the ask ("固定" / "取消固定") and travels with the path it is about,
 *   which is the row the line is drawn under.
 * - The reason is whatever the server gave, verbatim.
 */
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import {
  storageModeRefused,
  storagePinRefused,
} from "../src/features/settings/storage-settings-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("storageModeRefused", () => {
  it("names turning the mode on as the ask that failed", () => {
    expect(storageModeRefused(true, "Internal server error")).toBe(
      "开启清理模式被拒：Internal server error",
    );
  });

  it("names turning it off as a different ask", () => {
    // The switch is still where the server has it, so the sentence has to say which way failed.
    expect(storageModeRefused(false, "Internal server error")).toBe(
      "关闭清理模式被拒：Internal server error",
    );
  });

  it("carries the server's reason verbatim, punctuation and all", () => {
    // `refusalText` already localized what it could; whatever it hands over is what is drawn.
    expect(storageModeRefused(false, "服务器内部错误，请稍后重试。")).toBe(
      "关闭清理模式被拒：服务器内部错误，请稍后重试。",
    );
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    expect(S.settings.storageModeRefused(true, "nope")).toBe(
      "Turning the cleanup mode on was refused: nope",
    );
    expect(S.settings.storageModeRefused(false, "nope")).toBe(
      "Turning the cleanup mode off was refused: nope",
    );
  });
});

describe("storagePinRefused", () => {
  it("keeps the path, so the page draws the line under that row", () => {
    const refusal = storagePinRefused("logs/a.log", true, "Internal server error");
    expect(refusal.path).toBe("logs/a.log");
  });

  it("says a refused pin in the pin button's words", () => {
    expect(storagePinRefused("logs/a.log", true, "Internal server error").text).toBe(
      "固定「logs/a.log」被拒：Internal server error",
    );
  });

  it("says a refused unpin in the unpin button's words", () => {
    expect(storagePinRefused("logs/a.log", false, "Internal server error").text).toBe(
      "取消固定「logs/a.log」被拒：Internal server error",
    );
  });

  it("carries the path as the bill spells it, separators and all", () => {
    // The path is the row's identity: nothing about it may be shortened or escaped on the way in.
    expect(storagePinRefused("a b/c:d", true, "nope").text).toBe("固定「a b/c:d」被拒：nope");
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    expect(storagePinRefused("logs/a.log", true, "nope").text).toBe(
      'Pinning "logs/a.log" was refused: nope',
    );
    expect(storagePinRefused("logs/a.log", false, "nope").text).toBe(
      'Unpinning "logs/a.log" was refused: nope',
    );
  });
});
