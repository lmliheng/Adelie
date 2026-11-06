/**
 * server_settings table repo (admin-level server-global settings): key-value storage
 * with JSON-encoded values. An absent row means the setting's built-in default, so
 * settings added after a web.db was formed need no migration.
 */
import {
  clampAttachmentMb,
  DEFAULT_ATTACHMENT_MAX_MB,
  DEFAULT_ATTACHMENT_TOTAL_MB,
} from "../../services/attachment-limits.js";
import { DEFAULT_ASR_BASE_URL, DEFAULT_ASR_MODEL } from "../../services/asr.js";
import { Component, Use } from "@adelie/core/kernel";
import type { Db } from "../../hmr/capabilities.js";
import type { AsrSettings, Settings } from "../../mechanisms/settings.js";

/** Key of the "application uses the proxy" switch (the server's own outbound dispatcher); default on. */
const PROXY_FOR_APP_KEY = "proxy_for_app";

/** Key of the "agent environment uses the proxy" switch (command subprocess env policy); default on. */
const PROXY_FOR_AGENT_KEY = "proxy_for_agent";

/**
 * Legacy single-switch key from the unreleased #225 iteration (never in a release): read
 * as the fallback default for BOTH new switches while their own keys are absent, so a
 * main-branch deployment that had toggled it keeps its choice. Read-only adoption — the
 * legacy key is never written back, and either new key, once set, wins for its switch.
 */
const LEGACY_USE_SYSTEM_PROXY_KEY = "use_system_proxy";

/** Key of the explicit proxy address; absent/null = follow the proxy environment variables. */
const PROXY_URL_KEY = "proxy_url";

/** Key of the per-file composer attachment limit, in whole MB; default DEFAULT_ATTACHMENT_MAX_MB. */
const ATTACHMENT_MAX_MB_KEY = "attachment_max_mb";

/** Key of the per-message total attachment limit, in whole MB; default DEFAULT_ATTACHMENT_TOTAL_MB. */
const ATTACHMENT_TOTAL_MB_KEY = "attachment_total_mb";
/** Key of the company-mode master switch; default off (see getCompanyMode). */
const COMPANY_MODE_KEY = "companyMode";
/** Key of the Agent API switch; default on (see getAgentApiEnabled). */
const AGENT_API_KEY = "agentApiEnabled";

/** Speech input: the provider site, the model id, and the key to ask it with (see getAsrSettings). */
const ASR_BASE_URL_KEY = "asrBaseUrl";
const ASR_MODEL_KEY = "asrModel";
const ASR_API_KEY = "asrApiKey";

@Component()
export class ServerSettingsRepo implements Settings {
  @Use() private readonly db!: Db;

  /** Returns the raw JSON-encoded value; null if never set. */
  get(key: string): string | null {
    const r = this.db.prepare("SELECT value FROM server_settings WHERE key = ?").get(key);
    return r ? (r.value as string) : null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO server_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  /** Shared switch read: this key if present, else the legacy single switch, else the default: on. */
  private getProxySwitch(key: string): boolean {
    const raw = this.get(key);
    if (raw !== null) return raw !== "false";
    return this.get(LEGACY_USE_SYSTEM_PROXY_KEY) !== "false";
  }

  /** The "application uses the proxy" switch (the server's own outbound dispatcher). */
  getProxyForApp(): boolean {
    return this.getProxySwitch(PROXY_FOR_APP_KEY);
  }

  setProxyForApp(value: boolean): void {
    this.set(PROXY_FOR_APP_KEY, JSON.stringify(value));
  }

  /** The "agent environment uses the proxy" switch (command subprocess env policy). */
  getProxyForAgent(): boolean {
    return this.getProxySwitch(PROXY_FOR_AGENT_KEY);
  }

  setProxyForAgent(value: boolean): void {
    this.set(PROXY_FOR_AGENT_KEY, JSON.stringify(value));
  }

  /**
   * The explicit proxy address (normalized at write time by the settings route); null =
   * follow the proxy environment variables. An absent or unreadable row reads as null
   * (the safe default: behave as before the setting existed).
   */
  getProxyUrl(): string | null {
    const raw = this.get(PROXY_URL_KEY);
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw);
      return typeof value === "string" && value !== "" ? value : null;
    } catch {
      return null;
    }
  }

  setProxyUrl(value: string | null): void {
    this.set(PROXY_URL_KEY, JSON.stringify(value));
  }

  /**
   * Shared read for the two attachment limits: the stored whole-MB number, clamped back into the
   * legal range, or the built-in default when the row is absent or unreadable. Values only ever
   * enter through the validated PUT, so the clamp is for a database that predates a change to the
   * bounds (or was hand-edited) — using the nearest legal number is a better answer there than
   * refusing to serve uploads at all.
   */
  private getAttachmentMb(key: string, fallback: number): number {
    const raw = this.get(key);
    if (raw === null) return fallback;
    try {
      const value: unknown = JSON.parse(raw);
      return typeof value === "number" ? clampAttachmentMb(value, fallback) : fallback;
    } catch {
      return fallback;
    }
  }

  /** Per-file composer attachment cap, in whole MB. */
  getAttachmentMaxMb(): number {
    return this.getAttachmentMb(ATTACHMENT_MAX_MB_KEY, DEFAULT_ATTACHMENT_MAX_MB);
  }

  setAttachmentMaxMb(value: number): void {
    this.set(ATTACHMENT_MAX_MB_KEY, JSON.stringify(value));
  }

  /** Per-message total attachment cap (decoded bytes), in whole MB. */
  getAttachmentTotalMb(): number {
    return this.getAttachmentMb(ATTACHMENT_TOTAL_MB_KEY, DEFAULT_ATTACHMENT_TOTAL_MB);
  }

  setAttachmentTotalMb(value: number): void {
    this.set(ATTACHMENT_TOTAL_MB_KEY, JSON.stringify(value));
  }

  /**
   * The pair as one value — what the validators, the body cap and `/api/me` all read. Kept here
   * so no caller has to remember that the two numbers are only meaningful together (the total is
   * never below the per-file cap; the PUT enforces that against the effective post-write pair).
   */
  getAttachmentLimitsMb(): { attachmentMaxMb: number; attachmentTotalMb: number } {
    return {
      attachmentMaxMb: this.getAttachmentMaxMb(),
      attachmentTotalMb: this.getAttachmentTotalMb(),
    };
  }

  /**
   * Company mode master switch (default OFF): an absent row — and an unreadable one — means
   * off, so the whole mode stays out of the way until an admin turns it on under
   * System settings > Server > Company mode.
   */
  getCompanyMode(): boolean {
    const raw = this.get(COMPANY_MODE_KEY);
    if (raw === null) return false;
    try {
      return JSON.parse(raw) === true;
    } catch {
      return false;
    }
  }

  setCompanyMode(value: boolean): void {
    this.set(COMPANY_MODE_KEY, JSON.stringify(value));
  }

  /**
   * Whether external programs may reach Agents through the Agent API (default ON): only a stored
   * `false` turns it off, so an unreadable row leaves the feature as it ships. Read per request
   * by the `/api/amsp/v1` gate, so flipping it needs no restart.
   */
  getAgentApiEnabled(): boolean {
    return this.get(AGENT_API_KEY) !== "false";
  }

  setAgentApiEnabled(value: boolean): void {
    this.set(AGENT_API_KEY, JSON.stringify(value));
  }

  /**
   * Speech input settings. The site and the model read as the built-in defaults when their rows
   * are absent or unreadable — the page must show what a recording would actually use, and a
   * blank field that silently meant "the default" would not. The key has no default: an unset
   * one reads as "", and the transcribe route turns that into its own refusal.
   */
  getAsrSettings(): AsrSettings {
    return {
      baseUrl: this.getString(ASR_BASE_URL_KEY, DEFAULT_ASR_BASE_URL),
      model: this.getString(ASR_MODEL_KEY, DEFAULT_ASR_MODEL),
      apiKey: this.getString(ASR_API_KEY, ""),
    };
  }

  setAsrSettings(value: AsrSettings): void {
    this.set(ASR_BASE_URL_KEY, JSON.stringify(value.baseUrl));
    this.set(ASR_MODEL_KEY, JSON.stringify(value.model));
    this.set(ASR_API_KEY, JSON.stringify(value.apiKey));
  }

  /** A stored JSON string, or `fallback` when the row is absent, unreadable, blank or not a string. */
  private getString(key: string, fallback: string): string {
    const raw = this.get(key);
    if (raw === null) return fallback;
    try {
      const value: unknown = JSON.parse(raw);
      return typeof value === "string" && value.trim() !== "" ? value : fallback;
    } catch {
      return fallback;
    }
  }
}
