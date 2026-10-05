/**
 * Deployment variables whose *other* end lives outside this repository.
 *
 * A setting whose two ends are both this code base was renamed outright (see FORK-PROGRESS.md
 * § 2.2b, the `ADELIE_*` control-plane batch). This module is the read side of the batch that
 * cannot be renamed that way: its values are *written* by programs Adelie does not build here —
 * the desktop shell's launch environment, the systemd unit or shell rc of an existing deployment,
 * a launcher script from an older install. Those writers cannot move in the same release as this
 * reader, so each name is accepted in both spellings: `ADELIE_*` first, then the pre-rename
 * `PENGUIN_*`.
 *
 * Keeping the old spelling is not politeness, it is the difference between working and quietly
 * broken: a `PENGUIN_WEB_DB` that stopped being read points the server at `<root>/web.db` — a
 * different, empty file than the one the operator has been backing up.
 *
 * The rule is the one the data root already follows (`ROOT_ENV` / `LEGACY_ROOT_ENV` in paths.ts):
 * the new spelling wins when both are set, and a set-but-empty new name counts as set — the
 * consumers that treat blank as unset (the CLI entry, the port file) trim it themselves.
 *
 * Deliberately NOT in this table:
 * - the installer / release protocol (`PENGUIN_INSTALL_DIR`, `PENGUIN_VERSION`, the
 *   `PENGUIN_DOWNLOAD_*` switches, the `__PENGUIN_*__` build stamps): a running CLI downloads
 *   `install.sh` from a release, so old CLI × new script is a supported pair and both ends have to
 *   move together with the release chain (FORK-PROGRESS.md § 4.x).
 * - the upstream gateway (`PENGUIN_GO_*`): their service, and not ours to rename.
 * - the desktop shell's own switches (`PENGUIN_DESKTOP_SMOKE*`, `PENGUIN_NO_LOGIN_SHELL_ENV`,
 *   `PENGUIN_BB_SMOKE_BUNDLE`): read only inside the shell's own scripts and tests.
 */

/** One boundary setting: the spelling Adelie reads and writes, plus the one it still reads. */
export interface BoundaryEnvName {
  /** Adelie's own spelling; preferred when both are set. */
  readonly name: string;
  /** The pre-rename spelling, still read because its writer is outside this repository. */
  readonly legacy: string;
}

/**
 * The boundary settings and their two spellings. One entry per variable, so that a reader who is
 * about to spell one of these names by hand can see why it has two.
 */
export const BOUNDARY_ENV = {
  /** `--profile` of the desktop shell (it forks this server) and of an existing deployment. */
  profile: { name: "ADELIE_PROFILE", legacy: "PENGUIN_PROFILE" },
  /** Front-end build directory: the desktop shell, a systemd unit, an operator's `.env`. */
  webDist: { name: "ADELIE_WEB_DIST", legacy: "PENGUIN_WEB_DIST" },
  /** SQLite index path — an operator's override, honored by the server and by three CLI reads. */
  webDb: { name: "ADELIE_WEB_DB", legacy: "PENGUIN_WEB_DB" },
  /** The CLI entry the server offers: `penguin server|web` exports it, the shell passes one. */
  cliEntry: { name: "ADELIE_CLI_ENTRY", legacy: "PENGUIN_CLI_ENTRY" },
  /** Port announcement file the desktop shell polls when it starts the server with PORT=0. */
  portFile: { name: "ADELIE_PORT_FILE", legacy: "PENGUIN_PORT_FILE" },
  /** Per-launch desktop-mode token; the shell mints it, and it must never leave the machine. */
  desktopToken: { name: "ADELIE_DESKTOP_TOKEN", legacy: "PENGUIN_DESKTOP_TOKEN" },
  /** MinGit bash shipped by the Windows package; the launcher shim advertises its path. */
  bundledShell: { name: "ADELIE_BUNDLED_SHELL", legacy: "PENGUIN_BUNDLED_SHELL" },
} as const satisfies Record<string, BoundaryEnvName>;

/** Key of a boundary setting, for {@link boundaryEnv}. */
export type BoundaryEnvKey = keyof typeof BOUNDARY_ENV;

/**
 * Reads one boundary setting out of an environment: the Adelie spelling, then the pre-rename one.
 * Takes the environment as an argument rather than reading `process.env`, so tests can hand it a
 * fabricated one — the same shape the server's config parser and the shell resolver use.
 */
export function boundaryEnv(env: NodeJS.ProcessEnv, key: BoundaryEnvKey): string | undefined {
  const { name, legacy } = BOUNDARY_ENV[key];
  return env[name] ?? env[legacy];
}
