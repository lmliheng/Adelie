/**
 * The reachability test's refusal, and which run it belongs to.
 *
 * A probe answers every outcome it can have — reachable, timed out, DNS, refused, TLS — inside a
 * 200, one request per target. Only the request itself failing (a lost session, a dead server)
 * comes back as an error, and that sentence used to be a toast that dismissed itself after six
 * seconds: nothing else on the page changed, because a failed run fills no row, so a reader who
 * looked away was left with six untested targets and no way to tell "not run" from "could not
 * run". It now stays in the probe block until the next run starts.
 *
 * Both rules that decide whether an answer earns a sentence live here, in one place, because the
 * component fires one request per target and every one of them may land with the same failure:
 *
 * - One sentence per run. A lost session fails every target identically, and six copies of one
 *   sentence is not six pieces of information.
 * - An answer from a run that is no longer the live one says nothing. Saving adopts new settings
 *   mid-flight (and starts a new run when the reader asks again), and a sentence about a path
 *   nothing travels any more would be just as wrong as the stale numbers that save clears.
 */
import { refusalText } from "../../lib/api-error";

/** The sentence a run's failed request draws, named by the run it describes. */
export interface ProxyProbeRefusal {
  /** The run this sentence belongs to; a later run's sentence replaces it, its own duplicates do not. */
  readonly run: number;
  /** The words, drawn behind the shared `S.common.refused` lead-in. */
  readonly text: string;
}

/** One failed request of one run, as the component sees it when the promise rejects. */
export interface ProxyProbeAnswer {
  /** The run the request was fired by. */
  readonly run: number;
  /** The run the page is on now (`runSeq.current` at the moment the answer landed). */
  readonly liveRun: number;
  readonly error: unknown;
}

/**
 * What the block should say after one request failed: `current` when this answer earns no words
 * (it is from a superseded run, or its run already has its sentence), otherwise this answer's
 * sentence — which is also how the next run's sentence replaces the last one's.
 */
export function probeRefusalFor(
  current: ProxyProbeRefusal | null,
  answer: ProxyProbeAnswer,
): ProxyProbeRefusal | null {
  if (answer.run !== answer.liveRun) return current;
  if (current !== null && current.run === answer.run) return current;
  return { run: answer.run, text: refusalText(answer.error) };
}
