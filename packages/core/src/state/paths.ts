/**
 * Local directory layout for Agent State and Project config.
 *
 * Strictly follows the `~/.adelie/data/<project>/agents/<agent>/...` structure.
 * This module only provides constants and pure path functions; it never creates directories or reads/writes files.
 * Docs: /docs/sessions-and-traces § "Data layout".
 */
import os from "node:os";
import path from "node:path";

/** Default Project id used when none is specified. */
export const DEFAULT_PROJECT_ID = "default_project";

/**
 * Display name of the shared default Project (`DEFAULT_PROJECT_ID`). It is backfilled when that
 * Project is adopted rather than created: its directory is older than the Web onboarding and was
 * never written a name, and the UI falls back to showing the raw id (`default_project`), which
 * reads like a path rather than a label. A name the operator (or an older CLI) already set is
 * never overwritten, and the id itself is left alone — it names the directory, every Workspace
 * path and the CLI's own default chain.
 */
export const DEFAULT_PROJECT_NAME = "default";

/** Default Agent id used when none is specified. */
export const DEFAULT_AGENT_ID = "default_agent";

/**
 * Environment variable naming the data root, in Adelie's own spelling. Exported so the places
 * that read the root out of a plain env object (the server's config parser, which takes the
 * environment as an argument rather than from `process.env`) cannot drift from the rule here.
 */
export const ROOT_ENV = "ADELIE_HOME";

/**
 * The data root's pre-rename name, still read after `ROOT_ENV`. Every install made before Adelie
 * spelled its environment Adelie's way sets this one (the launcher script and the systemd units
 * of existing deployments do), so dropping it would point those installs at an empty default root
 * and make their Agents, Sessions and usage look gone. Kept as long as those installs exist;
 * setting the new name wins when both are present.
 */
export const LEGACY_ROOT_ENV = "PENGUIN_HOME";

/**
 * Resolves the local data root directory.
 * `ROOT_ENV` (`ADELIE_HOME`) wins, then `LEGACY_ROOT_ENV`; with neither set the default is
 * `~/.adelie/data` — under the hidden `~/.adelie` home so it never collides with unrelated
 * folders, and in a `data/` subdir kept separate from the installer's binaries under the same home.
 */
export function resolveRoot(): string {
  return (
    process.env[ROOT_ENV] ??
    process.env[LEGACY_ROOT_ENV] ??
    path.join(os.homedir(), ".adelie", "data")
  );
}

/** `<root>/<projectId>`. */
export function projectDir(root: string, projectId: string): string {
  return path.join(root, projectId);
}

/**
 * `<root>/plugins`: the user plugin directory — the library's second source, beside the
 * `@penguinharness/*` packages the build ships (see plugins/index.ts). One directory per
 * plugin, laid out exactly like a library plugin package (`plugin.json`, `icon.svg`, `skills/`,
 * `hooks/`), put there by a remote download or a local upload rather than by the installer. It
 * is a peer of the Project directories rather than something inside one: a plugin is part of
 * the installation, shared by every Project on the machine, so anything in it is read by every
 * Project's library and installed on an Agent the same way a built-in is. Doesn't exist until
 * the first import.
 */
export function userPluginsDir(root: string): string {
  return path.join(root, "plugins");
}

/**
 * `<projectDir>/agents` from an already-resolved Project directory path — the single
 * definition point of the agents-container layout.
 */
export function agentsDirFrom(projectDirPath: string): string {
  return path.join(projectDirPath, "agents");
}

/** `<projectDir>/agents`, the container directory holding every Agent in the Project. */
export function agentsDir(root: string, projectId: string): string {
  return agentsDirFrom(projectDir(root, projectId));
}

/** `<projectDir>/agents/<agentId>`. */
export function agentDir(root: string, projectId: string, agentId: string): string {
  return path.join(agentsDir(root, projectId), agentId);
}

/** `<agentDir>/agent_state`. */
export function agentStateDir(root: string, projectId: string, agentId: string): string {
  return path.join(agentDir(root, projectId, agentId), "agent_state");
}

/** `<agentDir>/traces`. */
export function tracesDir(root: string, projectId: string, agentId: string): string {
  return path.join(agentDir(root, projectId, agentId), "traces");
}

/** `<agentDir>/scratchpad`, the Agent's temporary/draft file directory (the model creates a subdirectory per Session id). */
export function scratchpadDir(root: string, projectId: string, agentId: string): string {
  return path.join(agentDir(root, projectId, agentId), "scratchpad");
}

/** `<agentDir>/workspaces`. */
export function workspacesDir(root: string, projectId: string, agentId: string): string {
  return path.join(agentDir(root, projectId, agentId), "workspaces");
}

/**
 * `<agentDir>/scratchpad/<sessionId>`, one Session's private scratchpad directory. The single
 * Session-scoped storage root shared by every by-product bound to that Session: input images
 * saved as path lines, the goal-mode control file, and Environment's truncated-tool-output
 * recovery files. Deleted together with the Session by the existing scratchpad cleanup path.
 */
export function sessionScratchpadDir(
  root: string,
  projectId: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(scratchpadDir(root, projectId, agentId), sessionId);
}

/**
 * `<projectDir>/.project_config.toml`, the Project's single config file (a hidden file, not
 * shown by default `ls`, written with mode 0600; model entries are inlined with their credential,
 * see state/project-config.ts).
 */
export function projectConfigPath(root: string, projectId: string): string {
  return path.join(projectDir(root, projectId), ".project_config.toml");
}

/** `<agentStateDir>/system_config.yaml`. */
export function systemConfigPath(root: string, projectId: string, agentId: string): string {
  return path.join(agentStateDir(root, projectId, agentId), "system_config.yaml");
}

/** `<agentStateDir>/AGENTS.md`. */
export function agentsMdPath(root: string, projectId: string, agentId: string): string {
  return path.join(agentStateDir(root, projectId, agentId), "AGENTS.md");
}

/** `<agentStateDir>/.vault.toml`, the Agent-level environment-variable vault (see state/agent-vault.ts). */
export function agentVaultPath(root: string, projectId: string, agentId: string): string {
  return path.join(agentStateDir(root, projectId, agentId), ".vault.toml");
}

/** `<agentStateDir>/tools`, reserved for user-defined Tool config. */
export function toolsDir(root: string, projectId: string, agentId: string): string {
  return path.join(agentStateDir(root, projectId, agentId), "tools");
}

/** `<agentStateDir>/memory`, the Memory root (one subdirectory per scope, see state/memory.ts). */
export function memoryDir(root: string, projectId: string, agentId: string): string {
  return path.join(agentStateDir(root, projectId, agentId), "memory");
}

/**
 * `<agentStateDir>/memory/<scopeKey>`, one Memory scope's topic-file directory — the `user`
 * scope or one Workspace's key. Each scope carries its own `MEMORY.md` index inside.
 */
export function memoryScopeDir(
  root: string,
  projectId: string,
  agentId: string,
  scopeKey: string,
): string {
  return path.join(memoryDir(root, projectId, agentId), scopeKey);
}

/** `<agentStateDir>/skills`. */
export function skillsDir(root: string, projectId: string, agentId: string): string {
  return path.join(agentStateDir(root, projectId, agentId), "skills");
}

/** `<agentStateDir>/hooks`: the installed hook packages, one directory per plugin (see agent-state.ts installHook). */
export function hooksDir(root: string, projectId: string, agentId: string): string {
  return path.join(agentStateDir(root, projectId, agentId), "hooks");
}

/** `<agentStateDir>/schedule`, the scheduled-task directory (doesn't exist when unconfigured). */
export function scheduleDir(root: string, projectId: string, agentId: string): string {
  return path.join(agentStateDir(root, projectId, agentId), "schedule");
}

/**
 * `<projectDir>/benchmarks`, the Project's capability-evaluation question banks and scores, a
 * sibling of `agents/` (doesn't exist when unconfigured). A Benchmark is a peer of an Agent, not
 * something an Agent owns: one Benchmark can evaluate several Agents, and the Agent under test is
 * recorded on each scoreboard evaluation. Benchmarks written under an Agent directory by an
 * earlier version are not read from here.
 */
export function benchmarksDir(root: string, projectId: string): string {
  return path.join(projectDir(root, projectId), "benchmarks");
}

/** `<agentDir>/snapshots`, Agent State version snapshots (doesn't exist when unconfigured). */
export function snapshotsDir(root: string, projectId: string, agentId: string): string {
  return path.join(agentDir(root, projectId, agentId), "snapshots");
}
