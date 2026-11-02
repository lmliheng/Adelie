/**
 * What the Plugins page says when it could not read the configuration it draws — this server's,
 * or the picked machine's.
 *
 * The page draws nothing until that read lands, so a failure leaves it empty; the reason used to
 * go to a toast, which dismisses itself after six seconds while the page stays empty and offers
 * nothing at all about it (7.19's rule, app-wide: a refusal lives where the thing it is about
 * lives). The failure is therefore a sentence for the page to draw where the cards would be;
 * leaving and re-entering the page is the retry, since the page has nothing of its own to retry
 * with.
 *
 * Which sentence: a picked machine is named, because it is the one that could not answer, while
 * this server has no name to print — the picker's "This server" is a bare label that would read
 * as a machine's name inside the machine phrasing, so this server gets its own words.
 */
import { S } from "../../lib/strings";

/** The line drawn where the cards would be — `machineName` is null for this server. */
export function pluginConfigUnreadable(machineName: string | null, reason: string): string {
  return machineName === null
    ? S.plugins.thisServerUnreadable(reason)
    : S.plugins.machineUnreadable(machineName, reason);
}
