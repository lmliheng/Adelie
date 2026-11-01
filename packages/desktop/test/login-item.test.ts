/**
 * The Windows login item: what the shell writes into the user's Run key, what it reads back out of
 * the operating system, and the two frames that carry the Appearance switch between the page and
 * the shell.
 *
 * The point of most of these cases is the pair of decisions login-item.ts explains at length: the
 * write pins a value name of our own (so the uninstaller can delete exactly one value), and the
 * read therefore cannot use Electron's `openAtLogin` — it uses `executableWillLaunchAtLogin`,
 * which is the "will Windows actually start this" answer.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appIdentity } from "../src/app-identity.js";
import {
  LOGIN_ITEM_FLAG,
  loginItemArgs,
  loginItemStatusMessage,
  loginItemStatusOf,
  loginItemWrite,
  parseLoginItemCommand,
  startedAtLogin,
  supportsLoginItem,
} from "../src/login-item.js";

describe("supportsLoginItem", () => {
  it("is the installed app on Windows, and nothing else", () => {
    expect(supportsLoginItem({ platform: "win32", profile: "release" })).toBe(true);
    // A dev shell has no entry to manage: an unpackaged run would register the bare electron.exe
    // from node_modules, and a `--dev` instance of an installed build would register the release
    // launch under a dev-suffixed name. Both are rows the user could not get rid of again.
    expect(supportsLoginItem({ platform: "win32", profile: "dev" })).toBe(false);
    expect(supportsLoginItem({ platform: "darwin", profile: "release" })).toBe(false);
    expect(supportsLoginItem({ platform: "linux", profile: "release" })).toBe(false);
  });
});

describe("startedAtLogin", () => {
  it("recognizes the argument the entry registers the app with", () => {
    expect(LOGIN_ITEM_FLAG).toBe("--started-at-login");
    expect(loginItemArgs()).toEqual([LOGIN_ITEM_FLAG]);
    // The main process's own argv shape: the executable first, the entry's arguments after it.
    // A second launch by hand carries neither.
    expect(startedAtLogin(["C:\\Adelie\\Adelie.exe", LOGIN_ITEM_FLAG])).toBe(true);
    expect(startedAtLogin(["C:\\Adelie\\Adelie.exe"])).toBe(false);
    expect(startedAtLogin([])).toBe(false);
    // Substrings and near misses are not the flag: the argument has to be the whole thing.
    expect(startedAtLogin(["--started-at-login=false"])).toBe(false);
    expect(startedAtLogin(["--started"])).toBe(false);
  });
});

describe("loginItemWrite", () => {
  it("registers the running executable, with the flag and its own value name", () => {
    const settings = loginItemWrite({
      name: "Adelie",
      execPath: "C:\\Users\\me\\AppData\\Local\\Programs\\Adelie\\Adelie.exe",
      openAtLogin: true,
    });
    expect(settings).toEqual({
      openAtLogin: true,
      path: "C:\\Users\\me\\AppData\\Local\\Programs\\Adelie\\Adelie.exe",
      args: ["--started-at-login"],
      enabled: true,
      name: "Adelie",
    });
  });

  it("clears a Task Manager 'disabled' even when turning the entry off", () => {
    // `enabled: true` is what removes the StartupApproved record; Electron ignores it when
    // openAtLogin is false (it deletes both values in that branch), but the field stays set so
    // the shape does not depend on which branch runs.
    expect(
      loginItemWrite({ name: "Adelie", execPath: "C:\\Adelie.exe", openAtLogin: false }),
    ).toEqual({
      openAtLogin: false,
      path: "C:\\Adelie.exe",
      args: ["--started-at-login"],
      enabled: true,
      name: "Adelie",
    });
  });
});

describe("loginItemStatusOf", () => {
  it("reports unsupported where there is no entry to manage, whatever the settings say", () => {
    expect(loginItemStatusOf({ supported: false, executableWillLaunchAtLogin: true })).toEqual({
      supported: false,
      openAtLogin: false,
    });
  });

  it("reports what Windows would really do", () => {
    expect(loginItemStatusOf({ supported: true, executableWillLaunchAtLogin: true })).toEqual({
      supported: true,
      openAtLogin: true,
    });
    // The user switched the entry off in Task Manager › Startup apps: enabled is false, so the
    // row shows off — which is the honest reading, the entry being registered notwithstanding.
    expect(loginItemStatusOf({ supported: true, executableWillLaunchAtLogin: false })).toEqual({
      supported: true,
      openAtLogin: false,
    });
  });
});

describe("the uninstaller", () => {
  it("deletes exactly the value the shell registers, both halves of it", () => {
    // The entry is written under the app's own name (loginItemWrite's `name`, which main.ts takes
    // from appIdentity), and the uninstaller deletes one literal — nothing at build time compares
    // the two, so a rename on either side would leave a dead row in Task Manager › Startup apps
    // that nothing in the product can remove.
    const nsh = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "build", "installer.nsh"),
      "utf8",
    );
    const name = appIdentity("release").name;
    expect(nsh).toContain(
      `DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "${name}"`,
    );
    // The StartupApproved half too: left behind, it would apply to whatever a later install
    // registers under the same name.
    expect(nsh).toContain(`StartupApproved\\Run" "${name}"`);
  });
});

describe("the Appearance switch on the wire", () => {
  it("wraps the status for the push to the page", () => {
    expect(loginItemStatusMessage({ supported: true, openAtLogin: false })).toEqual({
      type: "desktop-login-item-status",
      status: { supported: true, openAtLogin: false },
    });
  });

  it("reads a command frame, and nothing else", () => {
    expect(
      parseLoginItemCommand({ type: "desktop-login-item-command", openAtLogin: true }),
    ).toEqual({ openAtLogin: true });
    expect(
      parseLoginItemCommand({ type: "desktop-login-item-command", openAtLogin: false }),
    ).toEqual({ openAtLogin: false });
    // A frame carrying nothing this build understands is still a login-item command, and an empty
    // patch changes nothing; only a frame that is not one at all reads as null.
    expect(parseLoginItemCommand({ type: "desktop-login-item-command" })).toEqual({});
    expect(
      parseLoginItemCommand({ type: "desktop-login-item-command", openAtLogin: "yes" }),
    ).toEqual({});
    // The same port carries the tray's and the pet's frames; this reader must not answer to one.
    expect(parseLoginItemCommand({ type: "desktop-tray-command", showTrayIcon: true })).toBeNull();
    expect(parseLoginItemCommand(null)).toBeNull();
    expect(parseLoginItemCommand("desktop-login-item-command")).toBeNull();
  });
});
