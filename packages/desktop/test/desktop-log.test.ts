/**
 * 壳自己的日志：一行一条、可轮换、出错即静默。
 *
 * 「出错即静默」是这里最重要的性质：日志本身坏掉不能影响应用，所以专门验一条「文件根本
 * 写不了时不抛」。
 */
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_LOG_BYTES, createLogger, formatLogLine, rotatedPath, shouldRotate } from "../src/desktop-log.js";

function tempFile(): string {
  // 日志的落点是 `<userData>/logs/desktop.log`：连目录一起造出来，测的才是写日志这件事
  const dir = path.join(mkdtempSync(path.join(tmpdir(), "adelie-log-")), "logs");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "desktop.log");
}

const at = new Date("2026-10-04T12:00:00.000Z");

describe("formatLogLine", () => {
  it("带 ISO 时间戳与级别", () => {
    expect(formatLogLine("warn", "端口占用", at)).toBe("[2026-10-04T12:00:00.000Z] [warn] 端口占用\n");
  });

  it("把多行压成一行：日志的每一条都必须是一行", () => {
    expect(formatLogLine("info", "第一行\r\n第二行", at)).toBe("[2026-10-04T12:00:00.000Z] [info] 第一行 \\n 第二行\n");
  });
});

describe("shouldRotate", () => {
  it("到上限才轮换", () => {
    expect(shouldRotate(MAX_LOG_BYTES - 1)).toBe(false);
    expect(shouldRotate(MAX_LOG_BYTES)).toBe(true);
    expect(shouldRotate(10, 10)).toBe(true);
  });

  it("轮换后的落点只有一代", () => {
    expect(rotatedPath("/data/logs/desktop.log")).toBe("/data/logs/desktop.log.1");
  });
});

describe("createLogger", () => {
  it("目录不存在会自己建，写出去的是一行一条", () => {
    const file = tempFile();
    const log = createLogger(file, () => at);

    log.info("启动");
    log.error("炸了");

    expect(readFileSync(file, "utf8")).toBe(
      "[2026-10-04T12:00:00.000Z] [info] 启动\n[2026-10-04T12:00:00.000Z] [error] 炸了\n",
    );
    expect(log.file).toBe(file);
  });

  it("attach 把内置服务端的输出原样接进同一个文件（不再套一层时间戳）", () => {
    const file = tempFile();
    const log = createLogger(file, () => at);

    log.attach("服务端：监听 7370\n");
    log.attach(Buffer.from("服务端：就绪\n"));

    expect(readFileSync(file, "utf8")).toBe("服务端：监听 7370\n服务端：就绪\n");
  });

  it("已经超限的旧文件在开日志时就挪走，新的从零写起", () => {
    const file = tempFile();
    writeFileSync(file, "x".repeat(MAX_LOG_BYTES));

    const log = createLogger(file, () => at);
    log.info("轮换之后");

    expect(statSync(rotatedPath(file)).size).toBe(MAX_LOG_BYTES);
    expect(readFileSync(file, "utf8")).toBe(formatLogLine("info", "轮换之后", at));
  });

  it("文件写不了时静默降级：不抛，应用照跑", () => {
    const log = createLogger("", () => at);
    expect(() => log.info("写不进去")).not.toThrow();
    expect(() => log.attach("同样写不进去")).not.toThrow();
  });
});
