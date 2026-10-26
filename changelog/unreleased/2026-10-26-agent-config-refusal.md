# Agent settings: a refused config reset or kernel update keeps the reason in the card

- **Date:** 2026-10-26
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-26-agent-config-refusal.zh.md)

The Agent settings overview asks two questions that rewrite the config file: restore the defaults,
and advance the kernel. Both cards already stayed open on a refusal and changed nothing — the only
thing lost was the sentence. Why the server refused went into a toast alone, gone six seconds
later, while the card that asked was still on screen and its retry button sat at the bottom.

Both cards now hold their own answer: a refusal draws the server's words under the sentence the
card asked with (the app's existing "Refused:" lead-in), right beside the button that retries it.
Closing or reopening the card drops the previous reason. The Agents list's batch kernel update and
this page's API tab have worked this way for a while; these two were the last on the page that had
not caught up.

## Details

- `features/agents/agent-settings-page.tsx`: the overview gains `resetRefusal` / `kernelRefusal`,
  handed to `ConfirmModal`'s `refusal` slot the way the API tab does it (the server's own words in
  state, wrapped in `S.common.refused` when drawn); both the open and the close paths clear it, and
  a failure no longer toasts. The overview's name/description save still reports through a toast —
  it has no card, and the fields keep what was typed.
- New browser spec `e2e/agent-config-refusal.spec.mjs`, two cases: with `…/config/reset` and
  `…/config/kernel-update` refused at `page.route` 500, the reason is inside the card, the
  notification region never carries it, the card's own sentence is byte-for-byte what it was, and
  the server's config is unwritten; cancelling and reopening shows no stale reason, and the retry
  lands and closes the card. The kernel case edits `kernelOutdated` into the config read so its
  update button is live (a development data root ships the default Agent up to date).

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *where* a refusal is reported.
  No new copy beyond the existing `S.common.refused` lead-in.
