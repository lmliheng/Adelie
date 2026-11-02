/**
 * Reading one server-wide switch for the settings section that owns it (Agent API, company
 * mode): a single boolean out of `GET /api/admin/settings`.
 *
 * Both sections keep their switch disabled until the stored value is known, so a read that
 * fails leaves a dead knob under a value nobody read — and the page used to say so in a toast,
 * which is gone six seconds later while the knob stays dead (7.19's rule, app-wide: a refusal
 * lives where the control it is about lives). The failure is therefore handed back as a sentence
 * for the section to draw under the switch, the same slot these two switches already use for a
 * write the server refused.
 *
 * The read and the sentence live here rather than in each component so that both sections keep
 * doing it the same way, and so what a failed read becomes is one function with a test.
 */
import type { ServerSettingsResponse } from "@adelie/server/api";
import * as api from "../../api/endpoints";
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The stored value of one switch, or why it could not be read. */
export type ServerSwitchRead =
  { status: "read"; value: boolean } | { status: "unread"; reason: string };

/**
 * Reads one switch out of the admin settings. A failure never throws: the section has nothing to
 * retry on its own — leaving and re-entering the page is the retry — so all it can do is say why.
 */
export async function readServerSwitch(
  pick: (settings: ServerSettingsResponse["settings"]) => boolean,
): Promise<ServerSwitchRead> {
  try {
    const res = await api.adminGetSettings();
    return { status: "read", value: pick(res.settings) };
  } catch (e: unknown) {
    return { status: "unread", reason: refusalText(e) };
  }
}

/** The line under the switch: why it is dead, already localized — null when the value was read. */
export function serverSwitchRefusal(read: ServerSwitchRead): string | null {
  return read.status === "unread" ? S.common.refused(read.reason) : null;
}
