/**
 * The "insert the placeholder" strip at the head of a prompt section — Memory's own, and one each
 * for Skills / Vault / Schedules — and the line a refusal leaves under it.
 *
 * The strip's button asks the server to write a placeholder into the Agent's prompt template.
 * Nothing on the page moves until that write lands, so a refused one leaves the template exactly
 * as it was: the strip stays, its button stays, and that button is the retry. The reason used to
 * live only in a toast that dismissed itself after six seconds, and six seconds later the strip
 * looked as though it had never been pressed — the shape 7.19 bans app-wide. It matters more here
 * than for a bare settings write: this is the adoption path for the whole feature (memory never
 * entering the context, no skills or vault section, no schedules section).
 *
 * The sentence names the placeholder token, because four sections share the one sentence and
 * "the placeholder" alone would not say which. The verb follows the button that was pressed: a
 * legacy template's button migrates the old hardcoded section instead of inserting, and saying
 * "insert" there would describe a request nobody made.
 */
import { S } from "../../lib/strings";

/** The line a refused placeholder write leaves under the strip: which placeholder, the verb its button carried, and the server's reason as it gave it. */
export function placeholderInsertRefused(token: string, legacy: boolean, reason: string): string {
  return legacy
    ? S.agent.placeholderMigrateRefused(token, reason)
    : S.agent.placeholderInsertRefused(token, reason);
}
