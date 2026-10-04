/**
 * 窗口尺寸与位置：记住上次的样子，下次开在同一个地方（纯函数，可单测）。
 *
 * 为什么要夹到屏幕里：用户换了显示器、拔了外接屏、改了分辨率之后，上次那组坐标可能
 * 整个落在可见区域之外 —— 表现出来就是「点了图标没反应」（窗口在屏幕外面）。所以读回
 * 来的坐标**永远**先过一遍 `clampToWorkArea`。
 *
 * 只认 `workArea`（不含任务栏/程序坞）而不是整块屏幕：贴着底边放的窗口不该被任务栏
 * 盖住标题栏。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface WindowState {
  width: number;
  height: number;
  /** 左上角；null = 没记过（第一次启动，交给系统/窗口管理器摆） */
  x: number | null;
  y: number | null;
  maximized: boolean;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayLike {
  workArea: Bounds;
}

/** 第一次启动的尺寸：比默认 800×600 宽一点，够放下侧栏 + 对话 + 工具时间线 */
export const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1180,
  height: 780,
  x: null,
  y: null,
  maximized: false,
};

/** 最小可用尺寸（拖到比这更小，对话区就没法用了） */
const MIN_WIDTH = 720;
const MIN_HEIGHT = 520;

function finiteInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * 读回窗口状态。
 *
 * 人手改坏、旧版本格式、字段缺失一律退回默认值：一个记坏的文件不该让应用打不开窗口。
 */
export function parseWindowState(raw: string | null): WindowState {
  if (raw === null || raw.trim() === "") return { ...DEFAULT_WINDOW_STATE };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
  if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_WINDOW_STATE };
  const record = parsed as Record<string, unknown>;
  return {
    width: finiteInt(record["width"]) ?? DEFAULT_WINDOW_STATE.width,
    height: finiteInt(record["height"]) ?? DEFAULT_WINDOW_STATE.height,
    x: finiteInt(record["x"]),
    y: finiteInt(record["y"]),
    maximized: record["maximized"] === true,
  };
}

export function serializeWindowState(state: WindowState): string {
  return `${JSON.stringify({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    maximized: state.maximized,
  })}\n`;
}

/** 关窗/缩放结束时把 Electron 给的 bounds 收成要存的那几个数 */
export function stateFromBounds(bounds: Bounds, maximized: boolean): WindowState {
  return {
    width: Math.max(MIN_WIDTH, bounds.width),
    height: Math.max(MIN_HEIGHT, bounds.height),
    x: bounds.x,
    y: bounds.y,
    maximized,
  };
}

function intersects(a: Bounds, b: Bounds): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** 坐标落在哪块屏幕上：交集最大的一块；都不相交就退回第一块（主屏） */
function displayFor(state: WindowState, displays: readonly DisplayLike[]): DisplayLike | undefined {
  if (displays.length === 0) return undefined;
  if (state.x === null || state.y === null) return displays[0];
  const wanted: Bounds = {
    x: state.x,
    y: state.y,
    width: Math.max(MIN_WIDTH, state.width),
    height: Math.max(MIN_HEIGHT, state.height),
  };
  let best: DisplayLike | undefined;
  let bestArea = 0;
  for (const display of displays) {
    const area = intersects(wanted, display.workArea);
    if (area > bestArea) {
      bestArea = area;
      best = display;
    }
  }
  return best ?? displays[0];
}

/**
 * 把记下来的尺寸与坐标夹进某块屏幕的可用区域。
 *
 * 返回的是可以**直接交给 BrowserWindow** 的那组数：尺寸先按屏幕缩，坐标再按让出的空间
 * 夹。没有记过坐标（第一次启动）时按屏幕居中 —— 居中是唯一不需要猜用户偏好的摆法。
 */
export function clampToWorkArea(state: WindowState, displays: readonly DisplayLike[]): Bounds {
  const display = displayFor(state, displays);
  if (display === undefined) {
    // 拿不到屏幕信息（比如无头环境）：给一组安全的默认尺寸，位置交给系统
    return {
      width: Math.max(MIN_WIDTH, state.width),
      height: Math.max(MIN_HEIGHT, state.height),
      x: state.x ?? 0,
      y: state.y ?? 0,
    };
  }

  const area = display.workArea;
  const width = Math.min(Math.max(MIN_WIDTH, state.width), Math.max(MIN_WIDTH, area.width));
  const height = Math.min(Math.max(MIN_HEIGHT, state.height), Math.max(MIN_HEIGHT, area.height));
  if (state.x === null || state.y === null) {
    return {
      width,
      height,
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
    };
  }
  // 让窗口至少整块留在工作区里：标题栏拖得到、右下角关得了
  const x = Math.min(Math.max(state.x, area.x), area.x + Math.max(0, area.width - width));
  const y = Math.min(Math.max(state.y, area.y), area.y + Math.max(0, area.height - height));
  return { width, height, x: Math.round(x), y: Math.round(y) };
}

export function readWindowState(file: string): WindowState {
  try {
    return parseWindowState(readFileSync(file, "utf8"));
  } catch {
    // 没记过（第一次启动）与读不出来走同一条路：默认尺寸
    return { ...DEFAULT_WINDOW_STATE };
  }
}

/** 先写临时文件再 rename：断电/崩溃时不会留下半截 JSON（下一个读它的人会当成默认值） */
export function writeWindowState(file: string, state: WindowState): void {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, serializeWindowState(state), { mode: 0o600 });
    renameSync(tmp, file);
  } catch {
    // 写不进去只是下次开窗回到默认位置，不影响这次运行
  }
}
