/**
 * A Session's permission level, as the composer's button shows it — and each row of its menu,
 * for the level that row's pick would set: one colour for how much the Agent may do on its own.
 * Derived from the two knobs that decide it — the approval mode, and the Session's sandbox
 * policy — never stored.
 *
 * - `off`: every tool call is denied.
 * - `read-only`: commands cannot write anywhere.
 * - `all`: nothing stands in the way — full filesystem access, the network open, and every
 *   tool call approved without asking.
 * - `partial`: some write permission, with something still holding it back.
 */
import type {
  ApprovalMode,
  SessionSandbox,
  SessionSandboxPreset,
} from "@lmliheng/penguin-server/api";
import { ICONS } from "@lmliheng/penguin-ui";
import type { Tone } from "./tone";

export type PermissionLevel = "all" | "partial" | "read-only" | "off";

export function permissionLevel(
  approval: ApprovalMode,
  sandbox: Pick<SessionSandbox, "mode" | "network">,
): PermissionLevel {
  if (approval === "deny-all") return "off";
  if (sandbox.mode === "read-only") return "read-only";
  if (
    approval === "allow-all" &&
    sandbox.mode === "danger-full-access" &&
    sandbox.network === "open"
  ) {
    return "all";
  }
  return "partial";
}

/** The tone each level reads in: the more the Agent may do unasked, the louder. */
export const PERMISSION_LEVEL_TONE: Record<PermissionLevel, Tone> = {
  all: "danger",
  partial: "attention",
  "read-only": "success",
  off: "muted",
};

/** lucide `shield`: the outline the three shield icons below share. */
export const SHIELD =
  "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z";

/**
 * lucide's shield icons, one per level, so the level reads without colour: `shield-alert`
 * (all), `shield-half` (partial), `shield-check` (read-only), `shield-off` (off). Each icon's
 * `<path>` elements are joined into one `d` for GlyphIcon, a relative `m` rewritten as the
 * same absolute move, since a joined path would otherwise start it from the previous subpath.
 */
export const PERMISSION_LEVEL_GLYPH: Record<PermissionLevel, string> = {
  all: `${SHIELD}M12 8v4M12 16h.01`,
  partial: `${SHIELD}M12 22V2`,
  "read-only": `${SHIELD}M9 12l2 2 4-4`,
  off:
    "M2 2l20 20" +
    "M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71" +
    "M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264",
};

/**
 * Why a sandbox level cannot be picked on this server, or null when it can. With no backend
 * mounted, every level short of full access would refuse every command: `unavailable` when a
 * backend is enabled but failed to load or failed its check (see `firstUnavailableBackend`),
 * `no-backend` when none is enabled at all. Otherwise, the network level the mounted backends
 * cannot enforce. Only an explicit false from the server counts — one that does not report a
 * level is not second-guessed.
 */
export type LevelBlock =
  "no-backend" | "unavailable" | "local-unsupported" | "none-unsupported" | "mask-unsupported";

/** The first enabled backend that is not in use, whose reason the composer shows, or null. */
export function firstUnavailableBackend(
  sandbox: SessionSandbox,
): { name: string; reason: string } | null {
  return sandbox.unavailableBackends?.[0] ?? null;
}

/** The block for a level no mounted backend can enforce: why nothing is mounted. */
function unmounted(sandbox: SessionSandbox): LevelBlock {
  return firstUnavailableBackend(sandbox) === null ? "no-backend" : "unavailable";
}

/**
 * The block every level shares when the Session's policy masks paths (kept by every pick) and no
 * mounted backend masks: each command would be refused, full access included. Only an explicit
 * false counts, like the other flags.
 */
export function maskBlock(sandbox: SessionSandbox): LevelBlock | null {
  if (sandbox.masksPaths !== true) return null;
  if (sandbox.confinementSupported === false) return unmounted(sandbox);
  return sandbox.maskPathsSupported === false ? "mask-unsupported" : null;
}

export function fsModeBlock(
  sandbox: SessionSandbox,
  mode: SessionSandbox["mode"],
): LevelBlock | null {
  if (mode === "danger-full-access") return null;
  return sandbox.confinementSupported === false ? unmounted(sandbox) : null;
}

export function networkBlock(
  sandbox: SessionSandbox,
  network: SessionSandbox["network"],
): LevelBlock | null {
  if (network === "open") return null;
  if (sandbox.confinementSupported === false) return unmounted(sandbox);
  // `local` predates the other two flags, and has always been refused unless reported true.
  if (network === "local") {
    return sandbox.localNetworkSupported === true ? null : "local-unsupported";
  }
  return sandbox.noNetworkSupported === false ? "none-unsupported" : null;
}

/** What a Session starts from when the server has not said: confinement off, network open. */
export const UNCONFINED: SessionSandbox = { mode: "danger-full-access", network: "open" };

/**
 * One pick from the composer's menu: a preset's three values, saved together — or, with the
 * Sandbox switch off, the approval mode alone (`sandbox` absent). An approval-mode pick never
 * carries the policy: echoing the current one back would pin it in a draft (a later switch-on
 * then sends an unconfined level a member may not have) and re-check it on a Session (one
 * holding `local` on a server that cannot enforce it could not change its mode at all).
 */
export interface PermissionPick {
  approvalMode: ApprovalMode;
  sandbox?: Pick<SessionSandbox, "mode" | "network">;
}

/** A preset's pick: its approval mode and its policy together. */
export function presetPick(p: SessionSandboxPreset): PermissionPick {
  return { approvalMode: p.approvalMode, sandbox: { mode: p.mode, network: p.network } };
}

/** An approval-mode pick (switch off): the mode alone, the policy untouched. */
export function approvalModePick(mode: ApprovalMode): PermissionPick {
  return { approvalMode: mode };
}

/** A draft's sandbox pick after `pick`: only a preset pick changes it. */
export function draftSandboxAfter(
  prev: Partial<SessionSandbox>,
  pick: PermissionPick,
): Partial<SessionSandbox> {
  return pick.sandbox === undefined ? prev : { ...prev, ...pick.sandbox };
}

/**
 * The presets a server that does not report its own gets: the Sandbox card's declared table
 * (server `sandbox/settings-store.ts`), copied because an older server cannot send it. Kept
 * in step with that declaration by hand; it only matters until every server reports `presets`.
 */
export const BUILTIN_PRESETS: readonly SessionSandboxPreset[] = [
  {
    id: "full-access",
    name: "Full Access",
    nameZh: "完全访问",
    enabled: true,
    mode: "danger-full-access",
    network: "open",
    approvalMode: "allow-all",
  },
  {
    id: "always-ask",
    name: "Always Ask",
    nameZh: "每次询问",
    enabled: true,
    mode: "danger-full-access",
    network: "open",
    approvalMode: "always-ask",
  },
  {
    id: "workspace-write",
    name: "Workspace Write",
    nameZh: "仅工作区可写",
    enabled: true,
    mode: "workspace-write",
    network: "open",
    approvalMode: "allow-all",
  },
  {
    id: "read-only",
    name: "Read Only",
    nameZh: "只读",
    enabled: true,
    mode: "read-only",
    network: "open",
    approvalMode: "allow-all",
  },
  {
    id: "workspace-write-ask",
    name: "Workspace Write with Ask",
    nameZh: "仅工作区可写并询问",
    enabled: false,
    mode: "workspace-write",
    network: "open",
    approvalMode: "always-ask",
  },
  {
    id: "denied-all",
    name: "Denied All",
    nameZh: "全部拒绝",
    enabled: false,
    mode: "danger-full-access",
    network: "open",
    approvalMode: "deny-all",
  },
];

/** The presets the composer offers and names levels by: the server's, else the built-in table. */
export function presetsOf(sandbox: SessionSandbox): readonly SessionSandboxPreset[] {
  return sandbox.presets ?? BUILTIN_PRESETS;
}

/**
 * The preset a Session's level is: the first row, in table order, holding all three of its
 * values — a disabled row counts too. Null when none does (a level set from the full settings
 * or by an older client), which the composer shows as custom rather than rounding it to a row.
 */
export function matchPreset(
  presets: readonly SessionSandboxPreset[],
  approval: ApprovalMode,
  sandbox: Pick<SessionSandbox, "mode" | "network">,
): SessionSandboxPreset | null {
  return (
    presets.find(
      (p) =>
        p.approvalMode === approval && p.mode === sandbox.mode && p.network === sandbox.network,
    ) ?? null
  );
}

/**
 * The rows the composer's menu lists, in table order: the enabled presets whose approval mode
 * the Session may be given (`approvalModes`, from `approvalModeChoices`). An organization's
 * Session leaves out `always-ask`, so its presets are not offered there either — except the
 * current preset, which stays listed and ticked rather than leaving the menu with nothing
 * selected, the same exception the approval-mode list makes for its current value.
 */
export function menuPresets(
  presets: readonly SessionSandboxPreset[],
  approvalModes: readonly ApprovalMode[],
  current: SessionSandboxPreset | null,
): SessionSandboxPreset[] {
  return presets.filter(
    (p) => p.enabled && (p.id === current?.id || approvalModes.includes(p.approvalMode)),
  );
}

/**
 * Whether the server's Sandbox switch is off: new Sessions start unconfined, and the menu
 * offers the approval modes alone. Only an explicit false counts — a server that does not
 * report the switch keeps the presets menu it always had.
 */
export function sandboxSwitchOff(sandbox: Pick<SessionSandbox, "switchOn">): boolean {
  return sandbox.switchOn === false;
}

/** One row of the composer's permission menu. */
export type PermissionMenuRow =
  { kind: "preset"; preset: SessionSandboxPreset } | { kind: "approval"; mode: ApprovalMode };

/**
 * What the composer's permission menu lists. With the Sandbox switch on, the presets
 * (`menuPresets`); with it off, the approval modes the Session may be given, in the picker's
 * order — a pick then changes only the approval mode and keeps the Session's own policy, which
 * a Session created while the switch was on still holds.
 */
export function permissionMenu(
  sandbox: SessionSandbox,
  approvalModes: readonly ApprovalMode[],
  current: SessionSandboxPreset | null,
): PermissionMenuRow[] {
  if (sandboxSwitchOff(sandbox)) {
    return approvalModes.map((mode) => ({ kind: "approval", mode }));
  }
  return menuPresets(presetsOf(sandbox), approvalModes, current).map((preset) => ({
    kind: "preset",
    preset,
  }));
}

/**
 * The level a menu row would leave the Session at, which the row wears before its name — the
 * mark the button takes once the row is picked: a preset's own three values, or (switch off) the
 * approval mode over the policy the Session keeps.
 */
export function menuRowLevel(
  row: PermissionMenuRow,
  sandbox: Pick<SessionSandbox, "mode" | "network">,
): PermissionLevel {
  return row.kind === "preset"
    ? permissionLevel(row.preset.approvalMode, row.preset)
    : permissionLevel(row.mode, sandbox);
}

/**
 * Why a preset cannot be picked: a `LevelBlock` (this server cannot enforce it), or
 * `above-ceiling` — wider than the server's sandbox settings, which only an administrator may go
 * past (the server marks such a row `aboveCeiling` and refuses a non-admin's pick of it).
 */
export type PresetBlock = LevelBlock | "above-ceiling";

/** Who is picking: whether an administrator, and the preset the Session is on, if any. */
export interface PresetPicker {
  isAdmin: boolean;
  current: SessionSandboxPreset | null;
}

/**
 * Why a preset cannot be picked, or null when it can: the masked paths' enforcement block, else
 * its mode's, else its network's, else — given who is picking — the ceiling, which holds a non-admin only and never on
 * the preset the Session is already on (picking it changes nothing).
 */
export function presetBlock(
  sandbox: SessionSandbox,
  preset: Pick<SessionSandboxPreset, "mode" | "network"> &
    Partial<Pick<SessionSandboxPreset, "id" | "aboveCeiling">>,
  picker?: PresetPicker,
): PresetBlock | null {
  const enforce =
    maskBlock(sandbox) ??
    fsModeBlock(sandbox, preset.mode) ??
    networkBlock(sandbox, preset.network);
  if (enforce !== null) return enforce;
  if (
    picker !== undefined &&
    !picker.isAdmin &&
    preset.aboveCeiling === true &&
    preset.id !== picker.current?.id
  ) {
    return "above-ceiling";
  }
  return null;
}

/** One thing a preset holds back or lets through, as the hover text names it. */
export type PresetEffect =
  | "write-outside-workspace"
  | "write-anywhere"
  | "network"
  | "network-beyond-localhost"
  | "unasked-calls"
  | "unasked-writes"
  | "every-call"
  | "files-everywhere"
  | "files-in-workspace"
  | "read-files"
  | "network-open"
  | "localhost"
  | "calls-unasked"
  | "reads-unasked";

/** What a preset blocks and what it allows, from its three values, for the hover text. */
export function presetEffects(
  preset: Pick<SessionSandboxPreset, "mode" | "network" | "approvalMode">,
): {
  blocks: PresetEffect[];
  allows: PresetEffect[];
} {
  const blocks: PresetEffect[] = [];
  const allows: PresetEffect[] = [];
  if (preset.mode === "workspace-write") {
    blocks.push("write-outside-workspace");
    allows.push("files-in-workspace");
  } else if (preset.mode === "read-only") {
    blocks.push("write-anywhere");
    allows.push("read-files");
  } else allows.push("files-everywhere");
  if (preset.network === "none") blocks.push("network");
  else if (preset.network === "local") {
    blocks.push("network-beyond-localhost");
    allows.push("localhost");
  } else allows.push("network-open");
  if (preset.approvalMode === "deny-all") blocks.push("every-call");
  else if (preset.approvalMode === "always-ask") blocks.push("unasked-calls");
  else if (preset.approvalMode === "read-only") {
    blocks.push("unasked-writes");
    allows.push("reads-unasked");
  } else allows.push("calls-unasked");
  return { blocks, allows };
}
