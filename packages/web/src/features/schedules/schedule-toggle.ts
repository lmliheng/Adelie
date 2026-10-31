/**
 * The enable switch's refusal, and which row draws it.
 *
 * The switch writes nothing optimistically — it keeps the position the server has — so a refused
 * flip leaves no trace on the screen at all, and the only word about why was a toast that
 * dismissed itself after six seconds. That sentence now stays under that row instead, and it
 * stays until the next flip: the surfaces that list tasks (`schedule-panel.tsx` for the
 * conversation on screen, `schedules-page.tsx` for the whole Project) each keep their own copy of
 * it, the way they already keep their own copy of the delete confirmation's refusal — the rows
 * themselves are shared (`ScheduleRow`).
 *
 * Which row draws it is decided here, in one place, because both hosts ask that question: a task
 * is named by the Agent whose directory holds the file plus the file name, so two Agents may hold
 * tasks of the same name, and the sentence belongs to exactly one of them.
 */

/** The flip the server refused, named by the task it was about, with the server's words (`apiErrorText`). */
export interface ScheduleToggleRefusal {
  agentId: string;
  name: string;
  text: string;
}

/** What a row has to say to be the one the refusal names. */
export interface ScheduleTask {
  agentId: string;
  name: string;
}

/**
 * The line one row draws: the refused task's own sentence, and nothing on any other row — the
 * other rows were never written to, and a sentence about one task shown under another would read
 * as a failure of that one.
 */
export function scheduleRefusalFor(
  refusal: ScheduleToggleRefusal | null,
  task: ScheduleTask,
): string | null {
  if (refusal === null) return null;
  return refusal.agentId === task.agentId && refusal.name === task.name ? refusal.text : null;
}
