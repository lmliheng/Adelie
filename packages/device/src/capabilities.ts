/**
 * Capabilities are the small, versioned contract a bridge declares at handshake and the host
 * renders buttons and refuses commands from. Each one is per DEVICE, never a global switch,
 * and the defaults are the whole permission story: reading a phone's identity is what "there
 * is a phone" means, everything else is somebody's decision.
 *
 * Write capabilities are additionally approved per command — a grant says "this kind of
 * action is allowed on this phone", never "do it".
 */

export const CAPABILITIES = [
  "info:read",
  "apps:read",
  "apps:write",
  "files:read",
  "files:write",
  "screen:view",
  "input:control",
  "shell:exec",
  "notifications:read",
  "clipboard:read",
  "clipboard:write",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type CapabilityRisk = "low" | "medium" | "high";

export interface CapabilityInfo {
  id: Capability;
  risk: CapabilityRisk;
  /** On the first sighting of a device. Read-only identity and the app count are the two. */
  default: boolean;
  /** "Read" capabilities only observe; every write needs an approval per command. */
  write: boolean;
}

const INFO: Record<Capability, CapabilityInfo> = {
  "info:read": { id: "info:read", risk: "low", default: true, write: false },
  "apps:read": { id: "apps:read", risk: "low", default: true, write: false },
  "apps:write": { id: "apps:write", risk: "high", default: false, write: true },
  "files:read": { id: "files:read", risk: "medium", default: false, write: false },
  "files:write": { id: "files:write", risk: "high", default: false, write: true },
  "screen:view": { id: "screen:view", risk: "medium", default: false, write: false },
  "input:control": { id: "input:control", risk: "high", default: false, write: true },
  "shell:exec": { id: "shell:exec", risk: "high", default: false, write: true },
  "notifications:read": { id: "notifications:read", risk: "medium", default: false, write: false },
  "clipboard:read": { id: "clipboard:read", risk: "high", default: false, write: false },
  "clipboard:write": { id: "clipboard:write", risk: "medium", default: false, write: true },
};

export function capabilityInfo(capability: Capability): CapabilityInfo {
  return INFO[capability];
}

export function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && (CAPABILITIES as readonly string[]).includes(value);
}

/** True for a capability whose every command has to be approved by a person first. */
export function isWriteCapability(capability: Capability): boolean {
  return INFO[capability].write;
}

export type Permissions = Record<Capability, boolean>;

/** Every device starts here: reads of identity and the app list, nothing else. */
export function defaultPermissions(): Permissions {
  const out = {} as Permissions;
  for (const capability of CAPABILITIES) out[capability] = INFO[capability].default;
  return out;
}

/**
 * Fills in whatever a stored record leaves out — a row written by an older build, or a
 * hand-edited JSON — without ever widening a grant: an unknown or missing key takes its
 * default, which for every write capability is "off".
 */
export function normalizePermissions(value: unknown): Permissions {
  const out = defaultPermissions();
  if (typeof value !== "object" || value === null) return out;
  for (const [key, allowed] of Object.entries(value as Record<string, unknown>)) {
    if (isCapability(key) && typeof allowed === "boolean") out[key] = allowed;
  }
  return out;
}
