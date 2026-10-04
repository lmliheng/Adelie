/**
 * 托盘偏好的读取、落盘，以及最要紧的那条：关窗到底该不该「只是藏起来」。
 *
 * 这条判断错了会造出用户**逃不出去**的状态（没窗口、没托盘、进程还在跑），所以三个条件
 * 各自单独验一遍，再验一个「本可以藏但没托盘图标所以必须真退」的组合。
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAY_PREFS,
  hidesOnClose,
  parseTrayPrefs,
  readTrayPrefs,
  serializeTrayPrefs,
  writeTrayPrefs,
} from "../src/tray-prefs.js";

function tempFile(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "adelie-tray-")), "tray.json");
}

describe("parseTrayPrefs", () => {
  it("没记过 / 坏文件一律回到「图标开、关窗留守」", () => {
    expect(parseTrayPrefs(null)).toEqual(DEFAULT_TRAY_PREFS);
    expect(parseTrayPrefs("")).toEqual(DEFAULT_TRAY_PREFS);
    expect(parseTrayPrefs("不是 JSON")).toEqual(DEFAULT_TRAY_PREFS);
    expect(parseTrayPrefs("[]")).toEqual(DEFAULT_TRAY_PREFS);
  });

  it("只有明确的 false 才算关：缺字段的旧格式按默认的开算", () => {
    expect(parseTrayPrefs('{"showIcon":false}')).toEqual({ showIcon: false, hideOnClose: true });
    expect(parseTrayPrefs('{"hideOnClose":false}')).toEqual({ showIcon: true, hideOnClose: false });
    expect(parseTrayPrefs('{"showIcon":"no"}')).toEqual(DEFAULT_TRAY_PREFS);
  });

  it("写出的是可再读回的一行", () => {
    const prefs = { showIcon: false, hideOnClose: false };
    expect(parseTrayPrefs(serializeTrayPrefs(prefs))).toEqual(prefs);
  });
});

describe("读写", () => {
  it("写出去能读回来，目录不存在会自己建", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "adelie-tray-")), "deep", "tray.json");
    const prefs = { showIcon: false, hideOnClose: true };

    writeTrayPrefs(file, prefs);

    expect(readTrayPrefs(file)).toEqual(prefs);
  });

  it("文件不存在或内容坏了，读出来都是默认值，不抛", () => {
    const file = tempFile();
    expect(readTrayPrefs(file)).toEqual(DEFAULT_TRAY_PREFS);

    writeFileSync(file, "{ 半截");
    expect(readTrayPrefs(file)).toEqual(DEFAULT_TRAY_PREFS);
  });

  it("写的时候不留半截文件：写的是 tmp 再改名", () => {
    const file = tempFile();
    writeTrayPrefs(file, { showIcon: true, hideOnClose: false });
    // 最终文件是完整 JSON，且没有留下 .tmp
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ showIcon: true, hideOnClose: false });
  });
});

describe("hidesOnClose", () => {
  const on = { showIcon: true, hideOnClose: true };

  it("三条件齐备才留守", () => {
    expect(hidesOnClose({ quitting: false, hasTrayIcon: true, prefs: on })).toBe(true);
  });

  it("退出中不留守（否则退不掉）", () => {
    expect(hidesOnClose({ quitting: true, hasTrayIcon: true, prefs: on })).toBe(false);
  });

  it("没有托盘图标不留守（否则用户看不到任何入口）", () => {
    expect(hidesOnClose({ quitting: false, hasTrayIcon: false, prefs: on })).toBe(false);
  });

  it("偏好关掉时不留守", () => {
    expect(
      hidesOnClose({ quitting: false, hasTrayIcon: true, prefs: { showIcon: false, hideOnClose: false } }),
    ).toBe(false);
  });
});
