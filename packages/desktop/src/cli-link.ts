/**
 * 把 Adelie 自带的 CLI 挂到用户的 PATH 上（纯函数 + 一次读写，可单测）。
 *
 * 目标体验是「装了桌面版，终端里就能敲 `adelie`」，而且**不需要用户自己装 Node**：
 * 启动脚本把 Electron 二进制当 Node 跑（`ELECTRON_RUN_AS_NODE=1` + CLI 入口），用的就是
 * 应用自带的那份运行时。
 *
 * 两条「绝不」（抄 Penguin 的教训，代价都是别人的时间）：
 *   1. **绝不覆盖不是我们写的 `adelie`** —— 用户或别的包管理器放的，可能是他真正在用的
 *      那个。判据是文件里有没有我们的标记（`LAUNCHER_MARKER`）。
 *   2. **绝不从不稳定的位置安装** —— macOS 从 dmg 挂载点、或 Gatekeeper 的
 *      AppTranslocation 目录里跑时，写进去的链接在卸载/重启后就悬空了。
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

/** 写进启动脚本的标记：认得出「这是我们装的」，才敢覆盖 */
export const LAUNCHER_MARKER = "adelie-desktop-launcher";

export interface LauncherInput {
  /** Electron/应用可执行文件 */
  executable: string;
  /** 随包走的 CLI 入口（打包后是 `<app>/dist/cli.js`） */
  cliEntry: string;
}

export function posixLauncherScript({ executable, cliEntry }: LauncherInput): string {
  return [
    "#!/bin/sh",
    `# ${LAUNCHER_MARKER} —— 由 Adelie 桌面版生成，删掉这个文件即可取消`,
    "# 用应用自带的运行时跑自带的 CLI，因此不需要用户装 Node。",
    "ELECTRON_RUN_AS_NODE=1 exec " +
      `${shellQuote(executable)} ${shellQuote(cliEntry)} "$@"`,
    "",
  ].join("\n");
}

export function windowsLauncherScript({ executable, cliEntry }: LauncherInput): string {
  return [
    "@echo off",
    `rem ${LAUNCHER_MARKER} —— 由 Adelie 桌面版生成，删掉这个文件即可取消`,
    "setlocal",
    "set ELECTRON_RUN_AS_NODE=1",
    `"${executable}" "${cliEntry}" %*`,
    "",
  ].join("\r\n");
}

/** 单引号包裹并转义内部单引号：路径里带空格、`$`、引号时不会把脚本拆坏 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function shimFileName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "adelie.cmd" : "adelie";
}

/**
 * 安装位置。刻意**都不用提权**：
 *
 * - macOS / Linux：`~/.local/bin`（改这片目录不需要 sudo）。它可能不在 PATH 里，
 *   所以安装成功后把这件事写进日志，界面与文档里也提醒一句。
 * - Windows：`%LOCALAPPDATA%\Adelie\bin`，再把这个目录幂等地并进用户的 Path。
 */
export function shimDir(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string {
  if (platform === "win32") {
    const localAppData = env["LOCALAPPDATA"] ?? path.join(home, "AppData", "Local");
    return path.join(localAppData, "Adelie", "bin");
  }
  return path.join(home, ".local", "bin");
}

export type CliLinkDecision =
  /** 没有旧文件：装 */
  | "create"
  /** 旧文件是我们的（可能是应用移动后的悬空链接）：重写 */
  | "rewrite"
  /** 旧文件不是我们写的：一个字都别动 */
  | "skip-foreign"
  /** 从 dmg 挂载点 / AppTranslocation 里跑：位置不稳定，不装 */
  | "skip-volatile";

export interface CliLinkInput {
  platform: NodeJS.Platform;
  /** 目标文件现在的内容；不存在传 null */
  existing: string | null;
  /** 应用自己所在的路径（用来判断是不是从不稳定位置运行） */
  appPath: string;
  /** 用户明确拒绝过一次（记在偏好里）：别每次都问 */
  declined?: boolean;
}

export function decideCliLink(input: CliLinkInput): CliLinkDecision {
  if (input.declined === true) return "skip-foreign";
  if (isVolatileLocation(input.platform, input.appPath)) return "skip-volatile";
  if (input.existing === null) return "create";
  return input.existing.includes(LAUNCHER_MARKER) ? "rewrite" : "skip-foreign";
}

/**
 * 位置是否「不稳定」：macOS 的 dmg 挂载点（`/Volumes/...`）与 Gatekeeper 的
 * AppTranslocation 目录（`/private/var/folders/.../app translocation/`）。
 * 从这里写出去的链接，在用户把应用拖进「应用程序」或重启之后就指向空气。
 */
export function isVolatileLocation(platform: NodeJS.Platform, appPath: string): boolean {
  if (platform !== "darwin") return false;
  return appPath.startsWith("/Volumes/") || appPath.includes("AppTranslocation");
}

/**
 * Windows：把目录并进用户的 `Path`（幂等，大小写不敏感，保留原有顺序）。
 *
 * `Path` 里已经有它就不再追加 —— 每次启动都追加会让这个变量越滚越长，而 Windows 对
 * 它的长度是有上限的。
 */
export function mergeUserPath(current: string, entry: string): string {
  const parts = current
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const normalizedEntry = entry.replace(/[\\/]+$/, "").toLowerCase();
  if (parts.some((part) => part.replace(/[\\/]+$/, "").toLowerCase() === normalizedEntry)) {
    return parts.join(";");
  }
  return [...parts, entry].join(";");
}

export interface CliLinkResult {
  decision: CliLinkDecision;
  /** 写出去的路径（skip 时为 null） */
  path: string | null;
  /** 人话说明，写进日志与界面 */
  message: string;
}

/** 真正落盘：只在 decision 是 create/rewrite 时动手 */
export function linkCli(
  input: CliLinkInput & { dir: string; script: string },
): CliLinkResult {
  const decision = decideCliLink(input);
  const file = path.join(input.dir, shimFileName(input.platform));
  if (decision !== "create" && decision !== "rewrite") {
    const why =
      decision === "skip-volatile"
        ? "应用正从临时位置运行（dmg 挂载点 / AppTranslocation），先把 Adelie 拖进「应用程序」再装"
        : decision === "skip-foreign"
          ? `已经有一个不是 Adelie 装的 ${file}，不动它`
          : "用户之前拒绝过";
    return { decision, path: null, message: why };
  }

  try {
    mkdirSync(input.dir, { recursive: true });
    // 之前可能是个指向别处的符号链接（应用移动过）：先解开，避免 writeFileSync 写到链接目标上。
    // 必须用 lstat 判断：悬空的链接 existsSync 会回 false，于是「写到链接目标」这条错路照样会走。
    if (isSymlink(file)) rmSync(file, { force: true });
    writeFileSync(file, input.script, { mode: 0o755 });
    return {
      decision,
      path: file,
      message: decision === "create" ? `已安装 ${file}` : `已修复 ${file}`,
    };
  } catch (error) {
    return { decision, path: null, message: `写 ${file} 失败：${String(error)}` };
  }
}

/** 这个路径本身是不是一个符号链接（悬空的也算）：lstat 不看目标，existsSync 会看 */
function isSymlink(file: string): boolean {
  try {
    return lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

/** 仅供测试与诊断：这个路径现在指向哪 */
export function readLinkTarget(file: string): string | null {
  try {
    return lstatSync(file).isSymbolicLink() ? readlinkSync(file) : readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** 把一个已有的符号链接换掉（应用移动过之后必须重指） */
export function replaceSymlink(linkPath: string, target: string): void {
  try {
    rmSync(linkPath, { force: true });
    symlinkSync(target, linkPath);
  } catch {
    // 权限不足：下次启动再试，不影响应用本身
  }
}
