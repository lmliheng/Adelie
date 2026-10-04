/**
 * 自带 CLI 的路径解析与「装完能不能直接敲到」的判断。
 *
 * persistUserPath / ensureCliCommand 要碰 PowerShell 或真写盘，留到集成时验；这里只钉住
 * 两件在无头环境里也能判对的事：入口在哪、什么时候要提醒用户改 PATH。
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cliEntryPath, pathHint } from "../src/cli-install.js";

describe("cliEntryPath", () => {
  it("打包后随包走 <app>/cli-dist/cli.js", () => {
    expect(cliEntryPath({ isPackaged: true, appPath: "/app", desktopDist: "/app/dist" })).toBe(
      path.join("/app", "cli-dist", "cli.js"),
    );
  });

  it("源码运行时指回 packages/cli/dist/cli.js", () => {
    expect(
      cliEntryPath({ isPackaged: false, appPath: "/repo/packages/desktop", desktopDist: "/repo/packages/desktop/dist" }),
    ).toBe(path.join("/repo", "packages", "cli", "dist", "cli.js"));
  });
});

describe("pathHint", () => {
  const dir = "/home/me/.local/bin";

  it("已经在 PATH 里就没什么好提醒的", () => {
    expect(pathHint("linux", dir, { PATH: `/usr/bin:${dir}` })).toBeNull();
  });

  it("不在 PATH 里要说清楚「装了但敲不到」", () => {
    const hint = pathHint("linux", dir, { PATH: "/usr/bin:/bin" });
    expect(hint).toContain(dir);
    expect(hint).toContain("PATH");
  });

  it("结尾斜杠算同一个目录（PATH 里两种写法都常见）", () => {
    expect(pathHint("linux", dir, { PATH: `/usr/bin:${dir}/` })).toBeNull();
  });

  it("Windows 不归它管（那边由写注册表负责），一律 null", () => {
    expect(pathHint("win32", "C:\\Users\\me\\Adelie\\bin", { Path: "C:\\Windows" })).toBeNull();
  });
});
