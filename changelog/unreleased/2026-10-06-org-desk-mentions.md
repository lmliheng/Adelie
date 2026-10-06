# A busy desk gets one run for all the mentions it missed, and keeps them across a restart

- **Date:** 2026-10-06
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-06-org-desk-mentions.zh.md)

Every channel mention of an employee started a Task of its own at the employee's desk, queued
in the session's memory when the desk was busy. A desk working one long Task could return to
dozens of queued runs, each carrying the same channel context, most of them about work it had
already done; a restart or a hot update emptied that queue silently, and the scan had already
moved past the messages, so they were never delivered. Ported from upstream PenguinHarness
(`feat/org-trigger-coalesce`, commit `c41fa086`), which the fork did not carry.

## Details

- Mentions now wait in a new company-mode table, `org_desk_mentions` (migration 13,
  `company-mode-desk-mentions`, swap-safe), written in the same pass that moves the channel's
  scan offset and deduplicated by (employee, channel, message). The desk's session follow-up
  queue no longer holds them.
- Each reconcile pass carries the waiting mentions to every desk that is idle as one
  `kind: mention` run: up to `MENTIONS_PER_RUN` (20) per run, removed only once the run has
  started, so a refused start or a desk that cannot be opened leaves them for the next pass. A
  busy desk is passed over and its mentions keep accumulating.
- A single mention reads exactly as before. Several read as one list: every mention in full,
  grouped by channel, with the earlier-today context once per channel rather than once per
  mention; lines between them that named someone else are left to `penguin org channel tail`.
  The trigger's `message` names the first mention and how many more follow; `channel` is
  omitted when the mentions span channels.
- The run carries the highest hop among its mentions, so batching never resets the mention
  chain limit. Waiting mentions are held while the organization is paused or company mode is
  switched off, and an employee who leaves takes theirs along.
- The `company-employee` skill describes the batched `mention` run: answer each mention in its
  own channel and skip the ones already handled. `agent-company` is `2026.10.06.1`.
- A queue is cheaper than a run: this is what keeps a long Task from coming back to a dozen
  runs that re-read the same channel and the same handbook. `penguin cost --by session` is
  where the difference shows.
