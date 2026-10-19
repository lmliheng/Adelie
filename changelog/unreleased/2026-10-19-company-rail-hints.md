# The company rail's channel hints have a real-browser test

- **Date:** 2026-10-19
- **Type:** test
- **Scope:** `web` (adds `e2e/company-rail-hints.spec.mjs` only; no product code changed)
- **Breaking:** no

[中文版](2026-10-19-company-rail-hints.zh.md)

Which side a hover panel opens on already has a set of unit tests in `packages/ui` — they check
the numbers `besideTrigger` returns — and round 85 pinned the development rail and the right-hand
dock in a real browser. The **company mode rail** had unit tests only, and it is not the same
strip: its channel rows fold an unread count (or an "@me" count) into the same hint, they sit
below the page entries, and the channel the page is on carries `aria-current`. So nobody had
verified that the one `<TooltipLayer>` at the app root hears a real pointer there, measures the
row it actually hit, lands the panel where the rule says, and that the panel's words and the
row's accessible name agree.

Two cases now pin it into the suite.

## Details

- **A channel row**: create an organization, switch to company mode, open the all-hands channel,
  fold the sidebar to its 48 px rail (waiting for the width animation to settle — a box measured
  mid-fold still reports the expanded sidebar's edge), then hover "全员频道": the panel is pinned
  by `left` at the row's right edge + 8, wholly outside the rail, vertically centred on the row
  within 1.5 px, wholly on screen, and its `maxWidth` `room` is "viewport width − left − 8".
  Moving the pointer away takes the panel with it.
- **The unread note**: another member writes one line after this reader has left the channel;
  after a reload the row reads "全员频道 · N 条未读", the hover shows the same sentence, and the
  panel is placed by the same rule. The number comes from the server's channel listing
  (`unread` / `mentionsMe`), never from a literal in the test; the row's count badge is
  `aria-hidden`, so the hint and the accessible name have to say the same whole sentence and the
  panel must not repeat the count on its own.
- Every assertion is computed from the row's real box and the real viewport: a layout change that
  keeps the rule keeps the test green.

## Verification

- The new spec is **2 passed** (7.5 s) against a real server and a real browser; the whole e2e
  suite is **93 passed**.
- Two counter-proofs: dropping the row's `data-tooltip-placement="right"` turns both cases red at
  "the panel starts at the gap after the row" (the panel opens below instead, `left` lands at 8);
  dropping the unread note from the hint turns the second case red at "no row with that whole
  name", while the first stays green (the all-hands row has no note to begin with).
