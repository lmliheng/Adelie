/**
 * The device model as every participant sees it: the host stores it, the bridge reports it,
 * the panel renders it, the CLI prints it. One definition, so a field cannot mean two things.
 */
import type { Capability, Permissions } from "./capabilities.js";

export type DeviceKind = "android" | "ios" | "other";
export type DeviceTransport = "usb" | "wifi" | "companion" | "browser";
/** `connecting` is a bridge whose device it knows about but cannot talk to yet (pairing, adb start). */
export type DeviceState = "online" | "offline" | "unauthorized" | "pairing" | "connecting";

/** Devices belong to the instance; this row is what the panel draws and the CLI prints. */
export interface DeviceInfo {
  id: string;
  bridgeId: string;
  kind: DeviceKind;
  name: string;
  serial: string | null;
  transport: DeviceTransport;
  /** Human platform string, e.g. `Android 15`. */
  platform: string | null;
  state: DeviceState;
  /** What the bridge can do ON this device, as it declared it. */
  capabilities: Capability[];
  /** What the person allows on this device. Reads default on, writes default off. */
  permissions: Permissions;
  pairedAt: string | null;
  lastSeenAt: string | null;
  /** Display name override, notes, hidden — free-form, the UI's business. */
  prefs: DevicePrefs;
}

export interface DevicePrefs {
  displayName?: string;
  note?: string;
  hidden?: boolean;
}

/** Identity: read once when a device connects, again after a reboot or reconnect. */
export interface StaticInfo {
  brand?: string;
  model?: string;
  device?: string;
  serial?: string;
  androidVersion?: string;
  apiLevel?: number;
  securityPatch?: string;
  buildId?: string;
  fingerprint?: string;
  abi?: string;
  cpu?: string;
  kernel?: string;
  /** `su` on PATH: the device is rooted. */
  rooted?: boolean;
  bootloaderLocked?: boolean;
  verifiedBoot?: string;
  isEmulator?: boolean;
  firstSeenAt?: string;
}

/** What changes on its own: 15 seconds while somebody looks, three when the page is open. */
export interface DynamicInfo {
  power?: PowerInfo;
  memory?: MemoryInfo;
  storage?: StorageInfo;
  screen?: ScreenInfo;
  network?: NetworkInfo;
  audio?: AudioInfo;
  foreground?: string;
}

export interface PowerInfo {
  /** 0–100. */
  level?: number;
  charging?: boolean;
  /** `charging | discharging | full | not-charging | unknown`. */
  status?: string;
  /** Degrees Celsius as `dumpsys battery` reports tenths of a degree. */
  temperatureC?: number;
  voltageMv?: number;
  health?: string;
}

export interface MemoryInfo {
  totalBytes?: number;
  availableBytes?: number;
  usedBytes?: number;
}

export interface StorageInfo {
  totalBytes?: number;
  usedBytes?: number;
  availableBytes?: number;
}

export interface ScreenInfo {
  widthPx?: number;
  heightPx?: number;
  densityDpi?: number;
  refreshHz?: number;
  /** `portrait | landscape | …` as `dumpsys display` names it. */
  orientation?: string;
  locked?: boolean;
  brightness?: number;
}

export interface NetworkInfo {
  wifi?: { ssid?: string; ip?: string; mac?: string; rssi?: number; linkMbps?: number };
  mobile?: { operator?: string; type?: string; signalDbm?: number };
  vpn?: boolean;
  /** Every non-loopback IPv4 the device holds. */
  addresses?: string[];
}

export interface AudioInfo {
  /** 0–100. */
  volume?: number;
  muted?: boolean;
  playing?: { package?: string; title?: string; artist?: string };
}

export interface AppInfo {
  packageName: string;
  versionName?: string;
  /** Bytes, when the on-demand collector could get it. */
  sizeBytes?: number;
  thirdParty?: boolean;
}

export interface NotificationInfo {
  packageName: string;
  /** The title only: bodies are never stored (design §9). */
  title?: string;
  postedAt?: string;
  /** `true` for an ongoing (media, navigation) notification. */
  ongoing?: boolean;
}

/** One section of a snapshot, stamped with when it was collected. */
export interface SnapshotSection<T> {
  at: string;
  data: T;
}

/**
 * A layered snapshot: each layer is replaced as a whole when it arrives, and groups inside a
 * layer merge key by key — a dynamic refresh that only read the battery keeps the last
 * storage reading beside it. See `mergeSnapshot`.
 */
export interface DeviceSnapshot {
  static?: SnapshotSection<StaticInfo>;
  dynamic?: SnapshotSection<DynamicInfo>;
  apps?: SnapshotSection<AppInfo[]>;
  notifications?: SnapshotSection<NotificationInfo[]>;
  media?: SnapshotSection<AudioInfo>;
}

/** `state | notify | action | alert` — the audit table's own vocabulary. */
export type DeviceEventKind = "state" | "notify" | "action" | "alert";

export interface DeviceEvent {
  id?: number;
  deviceId: string;
  at: string;
  kind: DeviceEventKind;
  /** Who caused it: a user id, `agent:<sessionId>`, or `system`. */
  actor?: string | null;
  /** `connect | disconnect | screenshot | pull | push | install | uninstall | shell | input | grant | revoke | …` */
  action?: string | null;
  /** JSON, small and never sensitive: sizes, package names, error codes. */
  detail?: Record<string, unknown> | null;
}
