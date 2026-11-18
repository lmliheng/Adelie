# A layout change no longer takes the subagent panel's unsent words or its reasons with it

- **Date:** 2026-11-18
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-18-subagent-composer-across-layout.zh.md)

The agents panel is a dock panel. Crossing the breakpoint — the desktop right dock ↔ the narrow merged
surface — moves it from one mount to the other: the old one is unmounted, a fresh one is mounted, and
everything held in the composer's own state goes with it. Measured in a real browser last round: a
half-typed follow-up in the subagent's box, and the line that had just explained "that Stop did not
land", were both gone after one resize — and gone again after coming back — while the child kept
running the whole time.

Now all of that is still there afterwards, because on screen it is still true:

- the sentence you were typing (the child's draft, cached per session like the main composer's, so a
  reload finds it too);
- the reason a **Stop** did not reach the server (it belongs to that run — the child going idle takes
  it away, never a resize, and never a timer);
- the reason a message never reached the child (the draft and the same **Send** button are the retry).
  Two more things in the same box ride along: the reason a thinking level was not pinned, and the
  level that was pinned (the picker would otherwise fall back to what the child merely inherited).

## Details

- `packages/web/src/features/chat/subagent-composer-keep.ts` (new): one module-level record per
  **child Session** (`draft` / `send` / `stop` / `level` / `pinnedLevel`) and two functions to read
  and write it. Module state rather than storage: these sentences describe a live press and belong to
  the tab that saw it; a record with nothing in it is dropped, so a tab that visits many children
  keeps only the ones with something to say. The `draft` field is not redundant with the Session
  draft cache: that cache debounces 300 ms and flushes on unmount, and the flush lands after the
  replacement mount has already read the cache (React renders the new subtree before cleaning up the
  old one) — keystrokes inside the debounce window would still be lost. This field is written on
  every edit instead.
- `packages/web/src/features/chat/subagents-view.tsx`: `SubagentComposer`'s four pieces of local
  state become one record, every write going through one `remember()` (store first, then state —
  not an effect, which would bring back the "the new mount read before the write" problem); the box
  takes `useSessionDraft(childSessionId)`'s `initialText` / `onTextChange` / `initialSkills` /
  `onSkillsChange`, with `initialText` reading the record first and the cache as the fallback; a
  successful send or steer clears the cache and the record's text together (the clear on send does
  not call back, so nothing else would have).

## Tests

- `packages/web/test/subagent-composer-keep.test.ts` (new, 7 cases): an unwritten child reads the
  same empty record, what is written comes back, two children never share, a record is replaced
  rather than accumulated, an emptied record is dropped, text alone is kept, a pinned level alone is
  kept.
- `packages/web/e2e/subagent-composer-across-layout.spec.mjs` (new, 2 cases, real server + the
  repo's mock model): (1) the abort POST refused → the line appears, half a sentence is typed into
  the child's box, the window narrows to 390 → both are still there, back at 1280 → still there, and
  the notification region stays empty; then the box is cleared (an empty box is what puts **Stop**
  back on the button), the abort is let through, and the line leaves with the run. (2) the child's
  message POST refused as 500 → the reason sits above the box and survives both crossings, the draft
  is intact, and neither of the main card's slots is taken.
- **Counter-evidence (the same spec against the pre-change source and bundle): 2 failed / 0
  passed** — (1) `subagent-stop-refusal` is already gone at 390, (2) even `subagent-send-refusal` is
  not found at 390 (a 90-second timeout). The probe on the same scenario before the change: a
  sentence at 1280, and at 390 both the sentence and the draft empty, still empty back at 1280.
- **After the change, in a real browser:** at 390 the line is 374×50 just above the box holding
  "换布局前打的这一段"; back at 1280 it is 496×34 at y 736, above the box at y 787, `overflowX` false,
  no page errors, and the only console errors are the existing `/machines` 403 and this round's
  deliberate 500.

## Compatibility

Front-end state and its cache only: no interface, wire format or stored data changed. A child's draft
is stored per user × Session like the main composer's, so opening that child as a full Session later
finds the same draft.
