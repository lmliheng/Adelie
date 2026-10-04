/**
 * 把 CLI 挂到 PATH 上：脚本长什么样、什么时候不动别人的文件、PATH 怎么并。
 *
 * 两条「绝不」在这里被断言：不覆盖不是我们写的 `adelie`，不从 dmg / AppTranslocation 装。
 */
import { mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LAUNCHER_MARKER,
  decideCliLink,
  isVolatileLocation,
  linkCli,
  mergeUserPath,
  posixLauncherScript,
  readLinkTarget,
  replaceSymlink,
  shimDir,
  shimFileName,
  windowsLauncherScript,
} from "../src/cli-link.js";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "adelie-cli-"));
}

const launcher = { executable: "/opt/Adelie/adelie", cliEntry: "/opt/Adelie/dist/cli.js" };

describe("启动脚本", () => {
  it("posix：把 Electron 当 Node 跑自带 CLI，因此不需要用户装 Node", () => {
    const script = posixLauncherScript(launcher);
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(script).toContain(LAUNCHER_MARKER);
    expect(script).toContain(`ELECTRON_RUN_AS_NODE=1 exec '/opt/Adelie/adelie' '/opt/Adelie/dist/cli.js' "$@"`);
  });

  it("posix：路径带空格或单引号也不会把脚本拆坏", () => {
    const script = posixLauncherScript({ executable: "/opt/My App/it's/adelie", cliEntry: "/opt/x/cli.js" });
    expect(script).toContain(`'/opt/My App/it'\\''s/adelie'`);
  });

  it("windows：cmd 里设好环境变量再把参数全传下去", () => {
    const script = windowsLauncherScript(launcher);
    expect(script.startsWith("@echo off\r\n")).toBe(true);
    expect(script).toContain(`rem ${LAUNCHER_MARKER}`);
    expect(script).toContain("set ELECTRON_RUN_AS_NODE=1");
    expect(script).toContain('"/opt/Adelie/adelie" "/opt/Adelie/dist/cli.js" %*');
  });

  it("文件名与安装目录按平台分：都不用提权", () => {
    expect(shimFileName("linux")).toBe("adelie");
    expect(shimFileName("win32")).toBe("adelie.cmd");
    expect(shimDir("linux", {}, "/home/me")).toBe(path.join("/home/me", ".local", "bin"));
    expect(shimDir("darwin", {}, "/Users/me")).toBe(path.join("/Users/me", ".local", "bin"));
    expect(shimDir("win32", { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" }, "C:\\Users\\me")).toBe(
      path.join("C:\\Users\\me\\AppData\\Local", "Adelie", "bin"),
    );
    expect(shimDir("win32", {}, "/home/me")).toBe(path.join("/home/me", "AppData", "Local", "Adelie", "bin"));
  });
});

describe("decideCliLink", () => {
  const input = { platform: "linux" as NodeJS.Platform, existing: null, appPath: "/opt/Adelie" };

  it("空位就装", () => {
    expect(decideCliLink(input)).toBe("create");
  });

  it("旧的是我们自己写的（含标记）就重写：应用搬过家也不会指向旧路径", () => {
    expect(decideCliLink({ ...input, existing: `#!/bin/sh\n# ${LAUNCHER_MARKER}\n` })).toBe("rewrite");
  });

  it("旧的是别人的一个字都不动", () => {
    expect(decideCliLink({ ...input, existing: "#!/bin/sh\nnode /usr/lib/other/adelie.js\n" })).toBe("skip-foreign");
  });

  it("用户拒绝过就不再动", () => {
    expect(decideCliLink({ ...input, existing: null, declined: true })).toBe("skip-foreign");
  });

  it("从不稳定的位置运行（dmg 挂载点 / AppTranslocation）时不装", () => {
    expect(isVolatileLocation("darwin", "/Volumes/Adelie 1/Adelie.app")).toBe(true);
    expect(isVolatileLocation("darwin", "/private/var/folders/x/AppTranslocation/y/Adelie.app")).toBe(true);
    expect(isVolatileLocation("darwin", "/Applications/Adelie.app")).toBe(false);
    // 非 macOS 不存在这两种位置
    expect(isVolatileLocation("linux", "/Volumes/x")).toBe(false);
    expect(
      decideCliLink({ ...input, platform: "darwin", appPath: "/Volumes/Adelie/Adelie.app" }),
    ).toBe("skip-volatile");
  });
});

describe("mergeUserPath", () => {
  it("没有就追加到末尾，原有顺序保留", () => {
    expect(mergeUserPath("C:\\Windows;C:\\Tools", "C:\\Users\\me\\Adelie\\bin")).toBe(
      "C:\\Windows;C:\\Tools;C:\\Users\\me\\Adelie\\bin",
    );
  });

  it("已经有就不重复追加（大小写与结尾斜杠都算同一个），且原样保留原有拼写", () => {
    const current = "C:\\Windows;c:\\users\\me\\adelie\\bin\\";
    expect(mergeUserPath(current, "C:\\Users\\me\\Adelie\\bin")).toBe(current);
    // 幂等：再并一次也不会让 Path 变长
    expect(mergeUserPath(mergeUserPath(current, "C:\\Users\\me\\Adelie\\bin"), "C:\\Users\\me\\Adelie\\bin")).toBe(current);
  });

  it("空值时就是那一项", () => {
    expect(mergeUserPath("", "C:\\Users\\me\\Adelie\\bin")).toBe("C:\\Users\\me\\Adelie\\bin");
  });
});

describe("linkCli", () => {
  const script = posixLauncherScript(launcher);

  it("装上去的是可执行文件，内容正是脚本", () => {
    const dir = tempDir();
    const result = linkCli({ platform: "linux", existing: null, appPath: "/opt/Adelie", dir, script });

    expect(result.decision).toBe("create");
    expect(result.path).toBe(path.join(dir, "adelie"));
    expect(readFileSync(path.join(dir, "adelie"), "utf8")).toBe(script);
    // 可执行位
    expect((statSync(path.join(dir, "adelie")).mode & 0o111) !== 0).toBe(true);
  });

  it("遇到别人的 adelie 时一个字都不写", () => {
    const dir = tempDir();
    const foreign = "#!/bin/sh\nnode /usr/lib/other/adelie.js\n";
    writeFileSync(path.join(dir, "adelie"), foreign);

    const result = linkCli({ platform: "linux", existing: foreign, appPath: "/opt/Adelie", dir, script });

    expect(result.decision).toBe("skip-foreign");
    expect(result.path).toBeNull();
    expect(readFileSync(path.join(dir, "adelie"), "utf8")).toBe(foreign);
  });

  it("是我们装的（哪怕现在是个悬空链接）就重写", () => {
    const dir = tempDir();
    const link = path.join(dir, "adelie");
    symlinkSync("/gone/adelie", link);

    const result = linkCli({
      platform: "linux",
      existing: `#!/bin/sh\n# ${LAUNCHER_MARKER}\n`,
      appPath: "/opt/Adelie",
      dir,
      script,
    });

    expect(result.decision).toBe("rewrite");
    expect(readFileSync(link, "utf8")).toBe(script);
  });
});

describe("符号链接诊断", () => {
  it("readLinkTarget 对着链接给目标、对着普通文件给内容、不存在给 null", () => {
    const dir = tempDir();
    const link = path.join(dir, "adelie");
    symlinkSync("/opt/Adelie/adelie", link);
    expect(readLinkTarget(link)).toBe("/opt/Adelie/adelie");

    const file = path.join(dir, "plain");
    writeFileSync(file, "内容");
    expect(readLinkTarget(file)).toBe("内容");

    expect(readLinkTarget(path.join(dir, "missing"))).toBeNull();
  });

  it("replaceSymlink 把旧链接换指到新目标", () => {
    const dir = tempDir();
    const link = path.join(dir, "adelie");
    symlinkSync("/old/adelie", link);

    replaceSymlink(link, "/new/adelie");

    expect(readLinkTarget(link)).toBe("/new/adelie");
  });
});
