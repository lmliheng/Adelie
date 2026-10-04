/**
 * 窗口状态的读取与夹取。
 *
 * 这里最要紧的两条都不是「正常情况」：坏文件不该让应用开不出窗口，离屏坐标不该让窗口
 * 消失（用户看到的症状都是「点了没反应」）。所以测试里大量出现的是垃圾输入与屏幕外坐标。
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_STATE,
  clampToWorkArea,
  parseWindowState,
  readWindowState,
  serializeWindowState,
  stateFromBounds,
  writeWindowState,
} from "../src/window-state.js";

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

describe("parseWindowState", () => {
  it("没记过 / 不是 JSON / 不是对象，一律退回默认值", () => {
    expect(parseWindowState(null)).toEqual(DEFAULT_WINDOW_STATE);
    expect(parseWindowState("")).toEqual(DEFAULT_WINDOW_STATE);
    expect(parseWindowState("{")).toEqual(DEFAULT_WINDOW_STATE);
    expect(parseWindowState("42")).toEqual(DEFAULT_WINDOW_STATE);
    expect(parseWindowState("null")).toEqual(DEFAULT_WINDOW_STATE);
  });

  it("缺字段的旧格式：缺的走默认，坐标缺就是「没记过」", () => {
    expect(parseWindowState('{"width":900}')).toEqual({
      width: 900,
      height: DEFAULT_WINDOW_STATE.height,
      x: null,
      y: null,
      maximized: false,
    });
  });

  it("写出的是可再读回的一行", () => {
    const state = { width: 1000, height: 700, x: 12, y: 34, maximized: true };
    expect(parseWindowState(serializeWindowState(state))).toEqual(state);
  });
});

describe("stateFromBounds", () => {
  it("把 Electron 给的矩形收成要存的数，并抬到最小可用尺寸", () => {
    expect(stateFromBounds({ x: 5, y: 6, width: 300, height: 200 }, false)).toEqual({
      width: 720,
      height: 520,
      x: 5,
      y: 6,
      maximized: false,
    });
  });
});

describe("clampToWorkArea", () => {
  const displays = [
    { workArea },
    { workArea: { x: 1920, y: 0, width: 1280, height: 1024 } },
  ];

  it("第一次启动（没记坐标）按主屏居中", () => {
    const bounds = clampToWorkArea({ ...DEFAULT_WINDOW_STATE }, displays);
    expect(bounds.width).toBe(1180);
    expect(bounds.height).toBe(780);
    expect(bounds.x).toBe(Math.round((1920 - 1180) / 2));
    expect(bounds.y).toBe(Math.round((1040 - 780) / 2));
  });

  it("坐标在第二块屏上就按第二块屏夹，而不是拉回主屏", () => {
    const bounds = clampToWorkArea(
      { width: 1000, height: 700, x: 2000, y: 100, maximized: false },
      displays,
    );
    expect(bounds).toEqual({ width: 1000, height: 700, x: 2000, y: 100 });
  });

  it("记的坐标落在屏幕外（拔了外接屏）时拉回工作区里", () => {
    const bounds = clampToWorkArea(
      { width: 1180, height: 780, x: 3000, y: 5000, maximized: false },
      displays,
    );
    // 主屏（交集为 0 时退回第一块）
    expect(bounds.x).toBe(1920 - 1180);
    expect(bounds.y).toBe(1040 - 780);
  });

  it("比屏幕还大的尺寸缩到屏幕，坐标归到工作区原点", () => {
    const bounds = clampToWorkArea(
      { width: 5000, height: 5000, x: -800, y: -800, maximized: false },
      displays,
    );
    expect(bounds).toEqual({ width: 1920, height: 1040, x: 0, y: 0 });
  });

  it("拿不到屏幕信息（无头环境）也给一组安全的值，不抛", () => {
    const bounds = clampToWorkArea({ width: 900, height: 600, x: null, y: null, maximized: false }, []);
    expect(bounds).toEqual({ width: 900, height: 600, x: 0, y: 0 });
  });
});

describe("落盘", () => {
  it("写出去能读回来；目录不存在会自己建", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "adelie-window-")), "nested", "window.json");
    const state = { width: 1024, height: 768, x: 10, y: 20, maximized: false };

    writeWindowState(file, state);

    expect(readWindowState(file)).toEqual(state);
  });

  it("文件不存在时是默认值，不抛", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "adelie-window-")), "missing.json");
    expect(readWindowState(file)).toEqual(DEFAULT_WINDOW_STATE);
  });
});
