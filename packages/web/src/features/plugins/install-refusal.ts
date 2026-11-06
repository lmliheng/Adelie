/**
 * The two controls that install one library plugin onto one Agent — the card's one-click
 * "Install to <Agent>" button and a row's toggle in the card's "manage installs" Modal — and the
 * sentence one refused install leaves behind, and where it goes.
 *
 * An install goes out optimistically: the page marks the plugin present on that Agent as the
 * request leaves, which files the card into the other section, so the card is unmounted and the
 * Modal with it; a refusal rolls the mark back and the card returns. What the reader was left with
 * was a notification over the list that dismissed itself after six seconds, and a card that read
 * exactly as it had before the press — the files still not installed, nothing saying why.
 *
 * The sentence is therefore kept by the page, keyed by plugin, and drawn under that plugin's card
 * (the same `role="alert"` slot, danger colour, two lines and hover rule as 7.89–7.92): that card
 * is what the rollback brings back on screen, and its install button is the retry. It names the
 * Agent because the card's own button follows the page's Agent selection while a refused row of
 * the Modal may have been aimed at another Agent — which is also what keeps the sentence readable
 * once the Modal is gone.
 *
 * Whose words: the reason is the one `toggleInstall` already produced (`apiErrorText`, with
 * `refusalText`' rule for a value no server answered), so this sentence and the confirmation
 * dialogs' refusal slots keep speaking with one voice.
 */
import { S } from "../../lib/strings";

/** The sentence one refused install left, and the plugin it was for. */
export interface InstallRefusal {
  readonly plugin: string;
  readonly text: string;
}

/** The sentence: what could not be installed, which Agent it was going to, and why. */
export function installRefused(plugin: string, agent: string, reason: string): string {
  return S.plugins.installRefused(plugin, agent, reason);
}

/**
 * What this card draws for a refusal, if anything.
 *
 * A refusal belongs to the card of the plugin it was about — the plugin is what the page keys it
 * by, and cards for other plugins on the same page must not read it. Nothing else is matched: the
 * Agent is named inside the sentence, and the card's button follows whichever Agent the page
 * works with at the time (the refusal did not change that, only that Agent's empty install).
 */
export function installRefusalFor(
  refusal: InstallRefusal | null,
  plugin: string,
): string | undefined {
  if (refusal === null || refusal.plugin !== plugin) return undefined;
  return refusal.text;
}
