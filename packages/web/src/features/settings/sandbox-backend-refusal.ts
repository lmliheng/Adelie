/**
 * The install prompt on the Sandbox card: the sentence it keeps when a run of backend packages
 * did not leave the machine with what the switch needs, and why it is kept in the prompt instead
 * of arriving as a toast.
 *
 * The prompt asks one question ("install this OS's default backends?") and its own Install
 * button is the retry. A run can end without the backend: a package the server did list but the
 * process could not load, or a request that never got an answer — after it the run stops and the
 * later packages are not tried. Either way the machine is exactly as it was, the card behind the
 * dialog still reads "no backend for this OS", and the only account of it was a notification that
 * dismissed itself after six seconds (7.72's rule, applied to the dialog that asked).
 *
 * Two losses, named differently: a package that installed but failed to load is quoted with the
 * server's own words for it, while a request that threw is read through `refusalText` — the rule
 * every refusal slot in the app follows (7.19), so a localized code's sentence is used rather than
 * the wire's English.
 *
 * What is *not* in the sentence is as important as what is: only the packages still missing are
 * listed, because those are what the button behind the sentence retries. Naming a package that
 * did land would invite installing it a second time, and every install reloads the server's
 * plugins and stops agent runs in progress.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** A package the server listed but the process could not load, with the server's own words. */
export interface BackendInstallFailure {
  pkg: string;
  error: string;
}

/**
 * The run stopped on a request that never answered, so the packages after it were not tried —
 * wrapped rather than passed as `unknown`, so a thrown `null` still reads as "it stopped".
 */
export interface BackendInstallStop {
  error: unknown;
}

/**
 * The line the prompt draws under its question, or null when there is nothing to say (every
 * offered package installed). `remaining` is the offer minus what landed, in the order the run
 * tried them — the same list the prompt goes on to show.
 */
export function backendInstallRefusal(
  failures: readonly BackendInstallFailure[],
  stopped: BackendInstallStop | null,
  remaining: readonly string[],
): string | null {
  if (remaining.length === 0) return null;
  const reasons = failures.map((f) => S.plugins.deploymentFailedToast(f.pkg, f.error));
  if (stopped !== null) {
    reasons.push(S.settings.sandboxBackendPrompt.installStopped(refusalText(stopped.error)));
  }
  // Each reason goes in as a bare sentence: the joined line supplies the punctuation, and some
  // reasons already end one (a localized error code's own full stop) — keeping theirs would read
  // as "…。；…" or, at the end, as a doubled full stop.
  return S.settings.sandboxBackendPrompt.installRefused(
    reasons.map((reason) => reason.replace(/[。.；;]+$/u, "")),
    remaining,
  );
}
