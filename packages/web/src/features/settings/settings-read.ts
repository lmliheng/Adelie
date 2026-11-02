/**
 * Reading what a Settings page hydrates from `GET /api/admin/settings` — one switch, a pair of
 * limits, anything that page is about — and, when that read fails, the sentence saying so.
 *
 * Every such page keeps its controls disabled until the stored value arrives, so a read that
 * fails leaves dead controls under values nobody read — and the page used to say so in a toast,
 * which is gone six seconds later while the controls stay dead (7.19's rule, app-wide: a refusal
 * lives where the thing it is about lives). The failure is therefore handed back as a sentence
 * for the page to draw where its controls are, the same slot the write-side refusals use.
 *
 * What this page asks for is a `pick` over the settings rather than a field name, so the same
 * module serves a switch (Agent API, company mode) and a form of several numbers (upload limits)
 * without either page re-deriving its own read. A failed read never throws: these pages have
 * nothing to retry on their own — leaving and re-entering the page is the retry — so all they can
 * do is say why.
 *
 * The read and the sentence live here rather than in each component so that every page keeps
 * doing it the same way, and so what a failed read becomes is one function with a test.
 */
import type { ServerSettingsResponse } from "@adelie/server/api";
import * as api from "../../api/endpoints";
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** What one page takes out of the stored settings, or why it could not be read. */
export type SettingsRead<T> = { status: "read"; value: T } | { status: "unread"; reason: string };

/** Reads the admin settings once and hands back the `pick`ed part of them. */
export async function readServerSettings<T>(
  pick: (settings: ServerSettingsResponse["settings"]) => T,
): Promise<SettingsRead<T>> {
  try {
    const res = await api.adminGetSettings();
    return { status: "read", value: pick(res.settings) };
  } catch (e: unknown) {
    return { status: "unread", reason: refusalText(e) };
  }
}

/** The line under the controls: why they are dead, already localized — null when the read landed. */
export function settingsReadRefusal(read: SettingsRead<unknown>): string | null {
  return read.status === "unread" ? S.common.refused(read.reason) : null;
}
