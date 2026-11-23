# A desk the org chart could not open keeps its reason in the card

- **Date:** 2026-11-23
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-23-org-chart-desk-refusal.zh.md)

An employee card on the org chart carries one menu, and its first row is 「打开工位会话」: it reads the
desk session (creating one on the way in if there is none) and takes the reader there. When that read
failed, the reason was only a notification — which dismissed itself after six seconds, leaving the card
exactly as it had looked before the click, with nothing saying it had been refused or why.

The reason now goes into the card itself: a strip over the bottom of its face in the server's own words
(「操作被拒绝：…」), two lines at most, the whole sentence on hover. The same menu is the retry, and a new
attempt clears the strip first. A failed read never leaves the chart, so the sentence stands there
instead of walking away like a notification.

## Details

- `packages/web/src/features/company/org-chart-page.tsx`: a new `deskRefusal` (`{agentId, text}`);
  `openDesk`'s `catch` writes it through `refusalText` instead of `toastError`, and the page clears it
  when the attempt starts and when the organization changes. It is drawn only on the card that asked.
- `packages/web/src/features/company/chart-card.tsx`: the card takes a `refusal` and paints it over the
  ratio bar (`role="alert"`, danger ink, `line-clamp-2`, whole text on hover). **Why not under the
  card**: the box is fixed (the layout measures no text — `org-chart-tree.ts`) and the canvas clips at
  its own edge, so a line hanging below the bottom row would be cut off. The positioning layer and the
  clamped paragraph are separate elements, because an absolutely positioned box is blockified and
  `-webkit-box` does not survive that.
- No new wording, no new dependency, no API changes.

## Tests

- `packages/web/e2e/org-chart-desk-refusal.spec.mjs` (new, 1 case, real server + the repository's mock
  model): the desk route answers 500 in its own words → the sentence is on the card inside the canvas,
  measured to sit wholly within the card's face, absent from the notifications region, still there
  after seven seconds, and the URL has not moved; once the intercept is lifted, the same menu opens the
  desk and lands in `/chat/session-…`. On the pre-change build this fails: the canvas has no such
  `alert`, only a six-second notification.

## Compatibility

No route, storage format or wire type changed: the refusal is one client-side read.
