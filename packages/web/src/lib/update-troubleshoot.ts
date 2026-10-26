/**
 * The escape hatch on a download that could not reach GitHub: hand the run to an Agent.
 *
 * Retrying is the whole answer for a flaky moment, and the update modal offers it. It is no
 * answer at all for a host that cannot get to GitHub — a blocked or proxied network, a DNS that
 * answers with a captive portal — where the same request from the same host fails the same way
 * every time, and the user is left reading the Releases page in a browser that cannot open it
 * either. An Agent can do what the updater cannot: probe where the connection dies, fetch the
 * release through whatever route its own tools reach, verify it against the published checksum
 * and install it.
 *
 * What that costs is why the modal says so before the button is pressed: the diagnosis runs on a
 * model the user configured, and the calls are billed like any other. Nothing is submitted from
 * here either — the prompt is written into a new chat's draft (the AI bridge), and sending it
 * stays the user's own action.
 */
import { S } from "./strings";
import { stripAnsi } from "./strip-ansi";
import type { UpdateFlow } from "./update-flow";

/** A failed run, as the flow carries it (either backend). */
export type UpdateFailure = Extract<UpdateFlow, { kind: "error" }>;

/**
 * What "this host cannot reach GitHub" looks like in each backend's own words.
 *
 * - The CLI's fragments are its English i18n strings (`packages/cli/src/i18n.ts`, `update.*`):
 *   `services/update-job.ts` spawns it with ADELIE_LANG=en, and this web UI ships in the same
 *   install, so the strings can never come from a different release than this code.
 * - curl's own errno text rides along in the run's output tail, and is the most direct evidence
 *   of where the connection stopped.
 * - The desktop shell reports its updater's message instead (`packages/desktop/src/updater.ts`,
 *   `Could not download the update.`), with Electron's net error inside it.
 *
 * Matched case-insensitively against message and output tail together. A failure none of these
 * describe (a bad signature, a refused install, an admin-only refusal) gets no offer: it is not
 * something a network diagnosis would fix.
 */
export const UNREACHABLE_MARKERS = [
  "could not download the installer from",
  "could not reach ",
  "check your network and retry.",
  // The release lookup answered with something that was not GitHub's API — a captive portal or a
  // proxy interstitial, which is exactly the host that needs the hand-off.
  "lookup returned an unexpected response",
  "could not resolve host",
  "failed to connect to",
  "connection timed out",
  "operation timed out",
  "ssl connect error",
  "socket hang up",
  "could not download the update.",
  "net::err_",
  "err_connection",
  "err_timed_out",
  "err_internet_disconnected",
  "etimedout",
  "enotfound",
];

/**
 * How much of the run's output is quoted into the prompt. The job keeps a 64KB tail; the failure
 * is its last lines, and the composer is not a log viewer — the Agent can re-run the command
 * itself, so a truncated quote is information, not a loss. Only the end is kept (that is where
 * the CLI prints why it gave up) and the cut is marked.
 */
export const PROMPT_OUTPUT_MAX = 2000;

/** Whether this failure is the host being unable to reach GitHub (see UNREACHABLE_MARKERS). */
export function unreachableDownload(failure: UpdateFailure): boolean {
  const text = `${failure.message ?? ""}\n${failure.detail ?? ""}`.toLowerCase();
  return UNREACHABLE_MARKERS.some((marker) => text.includes(marker));
}

/** The run's own text for the prompt: ANSI stripped (the job's output may be coloured), tail kept, cut marked. */
function quoteOutput(failure: UpdateFailure): string {
  const text = stripAnsi(failure.detail ?? failure.message ?? "").trim();
  if (text.length <= PROMPT_OUTPUT_MAX) return text;
  return `…\n${text.slice(text.length - PROMPT_OUTPUT_MAX)}`;
}

/**
 * The prompt the chat is prefilled with: what failed and against which release, the run's own
 * output, then the fixed steps (`S.update.troubleshootPrompt*` — what to diagnose, where the
 * assets live, what not to touch).
 */
export function buildUpdateTroubleshootPrompt(failure: UpdateFailure): string {
  const output = quoteOutput(failure);
  return [
    S.update.troubleshootPromptLead(failure.version),
    output === "" ? "" : S.update.troubleshootPromptClip(output),
    S.update.troubleshootPromptTail(failure.version),
  ]
    .filter((part) => part !== "")
    .join("\n\n");
}
