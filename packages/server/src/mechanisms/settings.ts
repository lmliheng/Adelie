/**
 * The settings mechanisms: what a node may require, declared apart from what implements it.
 */
import { Interface } from "@adelie/core/kernel";

/** Settings: the mechanism ServerSettingsRepo implements. */
@Interface()
export abstract class Settings {
  abstract get(key: string): string | null;
  abstract set(key: string, value: string): void;
  abstract getProxyForApp(): boolean;
  abstract setProxyForApp(value: boolean): void;
  abstract getProxyForAgent(): boolean;
  abstract setProxyForAgent(value: boolean): void;
  abstract getProxyUrl(): string | null;
  abstract setProxyUrl(value: string | null): void;
  abstract getAttachmentMaxMb(): number;
  abstract setAttachmentMaxMb(value: number): void;
  abstract getAttachmentTotalMb(): number;
  abstract setAttachmentTotalMb(value: number): void;
  abstract getAttachmentLimitsMb(): { attachmentMaxMb: number; attachmentTotalMb: number };
  abstract getCompanyMode(): boolean;
  abstract setCompanyMode(value: boolean): void;
  abstract getAgentApiEnabled(): boolean;
  abstract setAgentApiEnabled(value: boolean): void;
  abstract getAsrSettings(): AsrSettings;
  abstract setAsrSettings(value: AsrSettings): void;
  abstract getRealtimeSettings(): RealtimeSettings;
  abstract setRealtimeSettings(value: RealtimeSettings): void;
}

/**
 * What the composer's microphone transcribes with: the speech provider's site, the model id
 * to ask for, and the key to ask with. Server-global, like the other settings here — the
 * recognition runs on the server, so the key belongs to the deployment rather than to each
 * browser that opens the page.
 *
 * `baseUrl` and `model` are never empty: an unset one reads as the built-in default (see
 * services/asr.ts), so the settings page always shows what a recording would actually use.
 */
export interface AsrSettings {
  /** The provider's site, e.g. `https://tokendance.space`. */
  baseUrl: string;
  /** The upstream model id. */
  model: string;
  /** The stored key, or "" when none has been saved yet. */
  apiKey: string;
}

/**
 * What the desktop pet's call runs on: the provider's site, the realtime model, the voice it
 * answers in, and the key to reach it with. Server-global like the speech-input settings beside
 * it, and for the same reason — the relay runs here, so the key belongs to the deployment rather
 * than to each browser that opens the window.
 *
 * `baseUrl`, `model` and `voice` are never empty: an unset one reads as the built-in default (see
 * services/realtime.ts), so the settings page always shows what a call would actually use. The key
 * has no default — an unset one reads as "" and is what makes the call button unavailable.
 */
export interface RealtimeSettings {
  /** The provider's site, e.g. `https://dashscope.aliyuncs.com`. */
  baseUrl: string;
  /** The upstream realtime model id. */
  model: string;
  /** The voice the model answers in, e.g. `Tina`. */
  voice: string;
  /** The stored key, or "" when none has been saved yet. */
  apiKey: string;
}

/** UiPrefsStore: the mechanism UiPrefsRepo implements. */
@Interface()
export abstract class UiPrefsStore {
  abstract get(userId: string): string | null;
  abstract set(userId: string, prefsJson: string): void;
}
