/**
 * 托盘偏好：图标开不开、关窗之后还留不留在后台（纯函数 + 一次读写，可单测）。
 *
 * 为什么偏好要落盘而不是只存在内存里：这两个开关都会**改变退出行为**，用户是按
 * 「我上次设过的样子」在预期它。读坏了就当默认值全开 —— 宁可多一个托盘图标，也不能
 * 让应用变成「没有窗口也没有图标、进程还在跑」。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface TrayPrefs {
  /** 显示托盘图标 */
  showIcon: boolean;
  /** 关闭窗口时最小化到托盘（而不是退出） */
  hideOnClose: boolean;
}

export const DEFAULT_TRAY_PREFS: TrayPrefs = { showIcon: true, hideOnClose: true };

export function parseTrayPrefs(raw: string | null): TrayPrefs {
  if (raw === null || raw.trim() === "") return { ...DEFAULT_TRAY_PREFS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_TRAY_PREFS };
  }
  if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_TRAY_PREFS };
  const record = parsed as Record<string, unknown>;
  return {
    // 只有明确的 false 才算关：字段缺失（旧版本）按默认的开
    showIcon: record["showIcon"] !== false,
    hideOnClose: record["hideOnClose"] !== false,
  };
}

export function serializeTrayPrefs(prefs: TrayPrefs): string {
  return `${JSON.stringify({ showIcon: prefs.showIcon, hideOnClose: prefs.hideOnClose })}\n`;
}

export function readTrayPrefs(file: string): TrayPrefs {
  try {
    return parseTrayPrefs(readFileSync(file, "utf8"));
  } catch {
    return { ...DEFAULT_TRAY_PREFS };
  }
}

/** 先写临时文件再 rename：断电/崩溃时不会留下半截 JSON（下一个读它的人会当成默认值） */
export function writeTrayPrefs(file: string, prefs: TrayPrefs): void {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, serializeTrayPrefs(prefs), { mode: 0o600 });
    renameSync(tmp, file);
  } catch {
    // 写不进去（只读盘、权限）不影响这次运行，只是下次启动回到默认值
  }
}

/**
 * 关窗时该不该「只是藏起来」。
 *
 * 三个条件必须同时成立（抄自 Penguin 的教训）：没在退出中、托盘图标真的在、偏好是开的。
 * 因为「进程在跑、既没有窗口也没有托盘图标」是用户**逃不出去**的状态：他看不到任何
 * 入口，只能去任务管理器。宁可多退一次（下次再开），也不能把用户锁在外面。
 */
export function hidesOnClose(input: {
  quitting: boolean;
  hasTrayIcon: boolean;
  prefs: TrayPrefs;
}): boolean {
  return !input.quitting && input.hasTrayIcon && input.prefs.hideOnClose;
}
