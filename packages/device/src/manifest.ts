/**
 * The adapter package (`.adev`) manifest — a zip with `manifest.json`, the binaries and the
 * licences. P0 ships no external adapters and no market; the format is fixed here anyway so
 * the ADB bridge and a later third-party adapter are the same kind of thing to the host
 * (design §5.4, §5.6). Nothing in this file runs or installs anything: it is the contract and
 * its validation.
 */
import {
  CAPABILITIES,
  isCapability,
  type Capability,
  type CapabilityRisk,
} from "./capabilities.js";

export const ADAPTER_MANIFEST_SCHEMA = "adelie.device-adapter/1";

export type AdapterPermission = "usb" | "network" | "bluetooth" | "filesystem";

const PERMISSIONS: readonly AdapterPermission[] = ["usb", "network", "bluetooth", "filesystem"];

export interface AdapterManifest {
  schema: typeof ADAPTER_MANIFEST_SCHEMA;
  /** Reverse-DNS, stable across versions: `dev.adelie.adb`. */
  id: string;
  name: string;
  version: string;
  /** Device protocol version the adapter speaks (see protocol.ts). */
  protocol: number;
  /** `win32-x64`, `darwin-arm64`, … — at least one; `entry` must cover each. */
  platforms: string[];
  /** Platform → path inside the package (relative, forward slashes). */
  entry: Record<string, string>;
  capabilities: Array<{ id: Capability; risk: CapabilityRisk }>;
  permissions: AdapterPermission[];
  /** sha256 of each shipped file, `"sha256-<hex>"`. */
  checksums?: Record<string, string>;
  signature?: { key: string; value: string };
}

export interface ManifestCheck {
  ok: boolean;
  problems: string[];
}

const ID_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const PLATFORM_RE = /^(win32|darwin|linux)-(x64|arm64|ia32|arm)$/;
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A path inside the package: forward slashes, no absolute prefix, no climbing out. */
function safeRelativePath(value: string): boolean {
  if (value === "" || value.startsWith("/") || value.startsWith("\\")) return false;
  if (/^[a-zA-Z]:/.test(value)) return false;
  return !value.split("/").some((part) => part === "..");
}

/**
 * Checks a parsed `manifest.json`. Every problem is reported, not just the first: an installer
 * shows them all before a person decides anything.
 */
export function validateManifest(value: unknown): ManifestCheck {
  const problems: string[] = [];
  if (!isRecord(value)) return { ok: false, problems: ["manifest.json must be an object"] };

  if (value.schema !== ADAPTER_MANIFEST_SCHEMA)
    problems.push(`schema must be "${ADAPTER_MANIFEST_SCHEMA}"`);
  if (typeof value.id !== "string" || !ID_RE.test(value.id))
    problems.push("id must be a reverse-DNS name, e.g. dev.adelie.adb");
  if (typeof value.name !== "string" || value.name.trim() === "")
    problems.push("name must be a non-empty string");
  if (typeof value.version !== "string" || !VERSION_RE.test(value.version))
    problems.push("version must look like 1.2.3 (an optional -prerelease suffix is allowed)");
  if (!Number.isInteger(value.protocol) || (value.protocol as number) < 1)
    problems.push("protocol must be a positive integer");

  const platforms = Array.isArray(value.platforms) ? value.platforms : null;
  if (platforms === null || platforms.length === 0) {
    problems.push("platforms must list at least one <os>-<arch>");
  } else {
    for (const platform of platforms) {
      if (typeof platform !== "string" || !PLATFORM_RE.test(platform))
        problems.push(`platform ${String(platform)} is not <os>-<arch>`);
    }
  }

  const entry = isRecord(value.entry) ? value.entry : null;
  if (entry === null) problems.push("entry must map each platform to a path");
  else if (platforms !== null) {
    for (const platform of platforms) {
      const path = entry[platform];
      if (typeof path !== "string" || !safeRelativePath(path))
        problems.push(`entry.${String(platform)} must be a relative path inside the package`);
    }
  }

  const capabilities = Array.isArray(value.capabilities) ? value.capabilities : null;
  if (capabilities === null) problems.push("capabilities must be a list (it may be empty)");
  else {
    for (const item of capabilities) {
      if (!isRecord(item) || !isCapability(item.id))
        problems.push(
          `capability ${JSON.stringify(item)} is not one of ${CAPABILITIES.join(", ")}`,
        );
      else if (!["low", "medium", "high"].includes(String(item.risk)))
        problems.push(`capability ${item.id} must carry a risk of low, medium or high`);
    }
  }

  const permissions = Array.isArray(value.permissions) ? value.permissions : null;
  if (permissions === null) problems.push("permissions must be a list (it may be empty)");
  else {
    for (const permission of permissions) {
      if (!PERMISSIONS.includes(permission as AdapterPermission))
        problems.push(`permission ${String(permission)} is not one of ${PERMISSIONS.join(", ")}`);
    }
  }

  if (value.checksums !== undefined) {
    if (!isRecord(value.checksums)) problems.push("checksums must be an object");
    else {
      for (const [file, digest] of Object.entries(value.checksums)) {
        if (!safeRelativePath(file)) problems.push(`checksums names an unsafe path: ${file}`);
        if (typeof digest !== "string" || !/^sha256-[0-9a-f]{64}$/.test(digest))
          problems.push(`checksums.${file} must be sha256-<64 hex>`);
      }
    }
  }

  if (value.signature !== undefined) {
    if (
      !isRecord(value.signature) ||
      typeof value.signature.key !== "string" ||
      typeof value.signature.value !== "string"
    )
      problems.push("signature must be { key, value }");
  }

  return { ok: problems.length === 0, problems };
}
