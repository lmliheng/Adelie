/**
 * 壳自己的日志：一行一条、带 ISO 时间戳、超限就轮换一次。
 *
 * 为什么桌面应用必须有自己的日志文件：用户报「打不开」的时候，唯一能拿到的是他截的屏；
 * 有了这个文件，他能直接把路径发过来。所以它必须**简单到不会出错**：
 *
 *   - 只同步 append（写日志不是热路径；异步的失败路径比同步的还多）；
 *   - 任何写失败都**吞掉**并关掉日志（日志坏了不能影响应用本身）；
 *   - 超过 5 MB 就 rename 成 `.1`（只留一代：桌面壳的输出量根本用不到多代）。
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";

export type LogLevel = "info" | "warn" | "error";

/** 单个日志文件的上限；桌面壳一天也就几十 KB，5 MB 足够翻旧账 */
export const MAX_LOG_BYTES = 5 * 1024 * 1024;

/** `[2026-10-04T12:00:00.000Z] [warn] 一句话` —— 时间戳用 ISO，跨时区看也不歧义 */
export function formatLogLine(level: LogLevel, message: string, at: Date): string {
  const oneLine = message.replace(/\r?\n/g, " \\n ").trim();
  return `[${at.toISOString()}] [${level}] ${oneLine}\n`;
}

export function shouldRotate(sizeBytes: number, maxBytes = MAX_LOG_BYTES): boolean {
  return sizeBytes >= maxBytes;
}

/** 轮换后的落点：`desktop.log` → `desktop.log.1`（覆盖上一代，不做无限代） */
export function rotatedPath(file: string): string {
  return `${file}.1`;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** 把一个可写流（内置服务端的 stdout/stderr）接到同一个文件上 */
  attach(chunk: unknown): void;
  /** 日志文件的绝对路径，菜单里的「查看日志」用它 */
  readonly file: string;
}

function toText(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString("utf8");
  return String(chunk);
}

/**
 * 建一个日志器。目录不存在就建；建不出来就返回一个**只往控制台写**的版本 ——
 * 日志不可用不该让应用起不来。
 */
export function createLogger(file: string, now: () => Date = () => new Date()): Logger {
  let disabled = false;
  let size = 0;

  const prepare = (): void => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      size = existsSync(file) ? statSync(file).size : 0;
      if (shouldRotate(size)) {
        rmSync(rotatedPath(file), { force: true });
        renameSync(file, rotatedPath(file));
        size = 0;
      }
    } catch {
      disabled = true;
    }
  };

  const write = (text: string): void => {
    if (disabled) return;
    try {
      if (shouldRotate(size)) prepare();
      appendFileSync(file, text);
      size += Buffer.byteLength(text);
    } catch {
      // 盘满了、只读、权限：关掉日志接着跑
      disabled = true;
    }
  };

  prepare();

  return {
    file,
    info: (message) => write(formatLogLine("info", message, now())),
    warn: (message) => write(formatLogLine("warn", message, now())),
    error: (message) => write(formatLogLine("error", message, now())),
    attach: (chunk) => write(toText(chunk)),
  };
}
