/**
 * 把随包走的 CLI 挂到 PATH 上 —— Electron 与环境相关的那一半。
 *
 * 纯判断（脚本长什么样、该不该动手）都在 cli-link.ts 里；这里只做三件绕不开环境的事：
 *   1. 算出 CLI 入口在哪（打包后随包走，源码运行时指回 packages/cli/dist）；
 *   2. 读出目标位置现在有什么（决定是装、是修、还是别动别人的）；
 *   3. Windows 上把安装目录并进**用户** Path（读系统 Path 会污染用户变量，所以走注册表
 *      那一份 —— 通过 PowerShell 的 [Environment]，避免 setx 的 1024 字符截断）。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  linkCli,
  mergeUserPath,
  posixLauncherScript,
  shimDir,
  shimFileName,
  windowsLauncherScript,
} from "./cli-link.js";
import type { CliLinkResult } from "./cli-link.js";

export interface CliEntryInput {
  isPackaged: boolean;
  appPath: string;
  /** 壳自己的 dist/（源码运行时是 packages/desktop/dist） */
  desktopDist: string;
}

/**
 * CLI 入口。打包后是 `<app>/cli-dist/cli.js`，源码运行时指回 `packages/cli/dist/cli.js`。
 *
 * 为什么是「整份 `packages/cli/dist` 原样搬进来」而不是让 tsup 再把 CLI 打一遍：那份产物
 * 是 CLI 自己的构建器出来的、**已经在 npm 上被人装过**的那一份，`chalk` 这类外部依赖与
 * 动态 chunk（`assets/`、`web-dist/`）都按它的预期摆好了。再打一遍等于多一条只有打包时
 * 才会踩到的失败路径（动态 import 被内联、相对资源找不到），而收益是省下不到 1 MB。
 */
export function cliEntryPath({ isPackaged, appPath, desktopDist }: CliEntryInput): string {
  return isPackaged
    ? path.join(appPath, "cli-dist", "cli.js")
    : path.join(desktopDist, "..", "..", "cli", "dist", "cli.js");
}

export interface CliInstallInput {
  platform: NodeJS.Platform;
  /** 随包走的 CLI 入口 */
  entry: string;
  /** 应用可执行文件（`app.getPath("exe")`）：启动脚本用它当 Node */
  executable: string;
  appPath: string;
  home: string;
  env: NodeJS.ProcessEnv;
  /** 用户明确拒绝过一次（界面里记下的偏好） */
  declined?: boolean;
}

/** 目标文件现在的内容；不存在或读不出来都是 null（交给 decideCliLink 走「装」） */
function readIfExists(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** 两个路径是不是同一个（macOS 默认大小写不敏感，Path 里也常见结尾斜杠） */
function samePath(a: string, b: string): boolean {
  const norm = (value: string): string => value.replace(/[\\/]+$/, "").toLowerCase();
  return a !== "" && norm(a) === norm(b);
}

/**
 * POSIX 上 `~/.local/bin` 未必在 PATH 里；装了但敲不到等于没装，所以要说清楚。
 * 返回 null 表示不用提醒（在 PATH 里，或者是 Windows —— 那边由 persistUserPath 负责）。
 */
export function pathHint(platform: NodeJS.Platform, dir: string, env: NodeJS.ProcessEnv): string | null {
  if (platform === "win32") return null;
  const onPath = (env["PATH"] ?? "").split(path.delimiter).some((entry) => samePath(entry, dir));
  return onPath ? null : `${dir} 不在 PATH 里：把它加进去（或重启终端）后 \`adelie\` 才敲得到`;
}

/**
 * Windows：把目录并进用户 Path。best-effort —— 拿不到注册表就返回 false，让调用方把
 * 「请手动加」写进日志与界面，而不是让启动失败。
 */
export function persistUserPath(dir: string, env: NodeJS.ProcessEnv): boolean {
  try {
    const current = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetEnvironmentVariable('Path','User')"],
      { encoding: "utf8", timeout: 5000, windowsHide: true },
    );
    // mergeUserPath 幂等：已经在里面就原样返回，写回去也不会让 Path 变长
    const merged = mergeUserPath(current.trim(), dir);
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::SetEnvironmentVariable('Path', $env:ADELIE_NEW_PATH, 'User')"],
      { encoding: "utf8", timeout: 5000, windowsHide: true, env: { ...env, ADELIE_NEW_PATH: merged } },
    );
    return true;
  } catch {
    return false;
  }
}

export interface CliInstallResult extends CliLinkResult {
  /** 装好之后能不能直接敲到（Windows 上以写入 Path 的结果为准） */
  ready: boolean;
}

/** 启动时调一次：装、修、或什么都不做，都不该让应用起不来 */
export function ensureCliCommand(input: CliInstallInput): CliInstallResult {
  const dir = shimDir(input.platform, input.env, input.home);
  const file = path.join(dir, shimFileName(input.platform));
  const script =
    input.platform === "win32"
      ? windowsLauncherScript({ executable: input.executable, cliEntry: input.entry })
      : posixLauncherScript({ executable: input.executable, cliEntry: input.entry });

  const linkInput = {
    platform: input.platform,
    existing: readIfExists(file),
    appPath: input.appPath,
    dir,
    script,
    ...(input.declined === undefined ? {} : { declined: input.declined }),
  };
  const result = linkCli(linkInput);
  if (result.path === null) return { ...result, ready: false };

  if (input.platform === "win32") {
    const ok = persistUserPath(dir, input.env);
    return {
      ...result,
      ready: ok,
      message: ok
        ? `${result.message}，并已加入用户 Path（新开的终端生效）`
        : `${result.message}；但没能写入用户 Path，请手动把 ${dir} 加进去`,
    };
  }

  const hint = pathHint(input.platform, dir, input.env);
  return {
    ...result,
    ready: hint === null,
    message: hint === null ? result.message : `${result.message}；${hint}`,
  };
}
