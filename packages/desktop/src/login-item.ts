/**
 * The Windows login item — Windows' own record that Adelie starts when the user signs in. Pure
 * functions over Electron's arguments and settings, no Electron imports (unit-tested).
 *
 * WHERE THE STATE LIVES, AND WHY THERE IS NO FILE BESIDE IT. The tray's two booleans and the
 * pet's one live in `userData/*.json` because they are OUR preferences: nothing else can change
 * them, so we are their only writer. This one is the opposite — the entry is a value under
 * `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, and the user can disable it from
 * Task Manager › Startup apps without asking us. A copy of it in userData could therefore be
 * wrong the moment it is written, and a page reading a stale copy would draw a switch that lies.
 * So the shell reads the operating system's own record on every launch and after every write,
 * and reports that.
 *
 * WHY THE READ USES A DIFFERENT FIELD THAN THE WRITE. `setLoginItemSettings` writes the Run value
 * under `name`, and Electron's `getLoginItemSettings().openAtLogin` is documented as "true if the
 * app is set to open at login" — but on Windows it does not mean that. Its implementation reads
 * the single Run value named the AppUserModelId, ignores any custom `name`, and compares that
 * value's command line against `path` + `args`; since we pin a `name` of our own (the uninstaller
 * deletes exactly one value), reading `openAtLogin` would answer "no" for the very entry this
 * module had just written. `executableWillLaunchAtLogin` is the field that answers the question
 * the switch is asking: it is true when ANY Run entry — ours, or one the user added by hand —
 * launches this executable and is not disabled in Task Manager.
 *
 * THE FLAG, AND WHY ONE IS NEEDED. `wasOpenedAtLogin` exists only on macOS (Electron marks it
 * `@platform darwin`), so on Windows the one launch the login item itself starts is recognized by
 * an argument we write into the entry; main.ts then opens no visible window for it, and the tray
 * is where the app waits.
 *
 * A MOVED INSTALL, AND WHY NOTHING IS REWRITTEN BEHIND THE USER'S BACK. The entry holds an
 * absolute executable path, so installing to another directory leaves a value pointing at the old
 * one — invisible to the read above, which matches on the running executable. It reads as OFF
 * (truthfully: nothing will start), and the next time the switch is turned on the write lands on
 * the same value name and overwrites the dead entry, so it heals by itself in the one flow that
 * touches it. What is deliberately NOT done is rewriting the entry at startup to "fix" it: the
 * read cannot tell a wrong path from an absent entry, and an unconditional write would silently
 * re-enable an entry the user had switched off in Task Manager — a background app that comes back
 * against their wishes, which is worse than a dead value Windows already shows them.
 */
import type {
  DesktopLoginItemCommandMessage,
  DesktopLoginItemStatus,
  DesktopLoginItemStatusMessage,
} from "@adelie/server/api";
import type { Profile } from "./app-identity.js";

/** The argument the login item registers the app with, and the one a launch is recognized by. */
export const LOGIN_ITEM_FLAG = "--started-at-login";

/** The arguments to register with, and to write into the entry. */
export function loginItemArgs(): string[] {
  return [LOGIN_ITEM_FLAG];
}

/**
 * Whether this build has a login item to manage at all: the installed app, on Windows, and
 * nothing else.
 *
 * Windows-only because it is the only platform with a Run key (macOS would use the same API but
 * a different mechanism, and Linux would need a `~/.config/autostart` entry — neither is built).
 * Release-only because the entry records an absolute executable path and nothing else: an
 * unpackaged run would register the bare `electron.exe` from node_modules, which starts the
 * default Electron app rather than Adelie, and a `--dev` instance of an installed build would
 * register the release launch (our args carry the flag, not `--dev`) under a dev-suffixed name.
 * Both would be entries the user cannot get rid of from the app, so neither is offered: a dev
 * shell simply has no row.
 */
export function supportsLoginItem(opts: { platform: string; profile: Profile }): boolean {
  return opts.platform === "win32" && opts.profile === "release";
}

/** Whether Windows' login item is what started this process (see the flag above). */
export function startedAtLogin(argv: readonly string[]): boolean {
  return argv.includes(LOGIN_ITEM_FLAG);
}

/** The `Settings` object handed to `app.setLoginItemSettings`, structurally Electron's own. */
export interface LoginItemWrite {
  openAtLogin: boolean;
  path: string;
  args: string[];
  enabled: true;
  name: string;
}

/**
 * What to write for one switch flip. `openAtLogin: false` asks Electron to delete the entry —
 * both the Run value and the StartupApproved one — and every other field is then ignored.
 *
 * `path` is passed explicitly rather than left to Electron's default, so the entry names the
 * executable that is running. `enabled: true` is what makes turning the switch back on work: it
 * clears any "disabled" the user left in Task Manager, without which the entry would be written
 * again and still never start.
 */
export function loginItemWrite(opts: {
  name: string;
  execPath: string;
  openAtLogin: boolean;
}): LoginItemWrite {
  return {
    openAtLogin: opts.openAtLogin,
    path: opts.execPath,
    args: loginItemArgs(),
    enabled: true,
    name: opts.name,
  };
}

/**
 * What the page is told: whether this build has an entry to manage, and whether Windows will
 * actually use it. `supported: false` is reported for every platform and profile without one,
 * and the page draws no row for it rather than a switch that would write nothing.
 */
export function loginItemStatusOf(opts: {
  supported: boolean;
  executableWillLaunchAtLogin: boolean;
}): DesktopLoginItemStatus {
  if (!opts.supported) return { supported: false, openAtLogin: false };
  return { supported: true, openAtLogin: opts.executableWillLaunchAtLogin };
}

/** Wraps what Windows currently says for the port push. */
export function loginItemStatusMessage(
  status: DesktopLoginItemStatus,
): DesktopLoginItemStatusMessage {
  return { type: "desktop-login-item-status", status };
}

/**
 * Validates one server-relayed command off the port. Null when the frame is not one, and an
 * empty patch when it is one carrying nothing this build understands — the same distinction the
 * tray's parser draws, for the same reason.
 */
export function parseLoginItemCommand(data: unknown): LoginItemCommand | null {
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Partial<DesktopLoginItemCommandMessage>;
  if (msg.type !== "desktop-login-item-command") return null;
  const patch: LoginItemCommand = {};
  if (typeof msg.openAtLogin === "boolean") patch.openAtLogin = msg.openAtLogin;
  return patch;
}

/** What one relayed command asks the shell to change; the route's patch is the same shape. */
export interface LoginItemCommand {
  openAtLogin?: boolean;
}
