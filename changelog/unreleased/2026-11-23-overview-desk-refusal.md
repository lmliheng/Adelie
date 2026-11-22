# A CEO desk the overview could not open keeps its reason in the page's own answer line

- **Date:** 2026-11-23
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-23-overview-desk-refusal.zh.md)

The company overview's header carries 「打开 CEO 工位」: it reads the desk session (creating one on the
way in if there is none) and takes the reader there. When that read failed, the reason was only a
notification — which dismissed itself after six seconds, leaving the header button exactly as it had
looked before the click, with nothing saying it had been refused or why.

The reason now goes into the page's own answer line, right under the header — the same slot the
refresh error uses — in the server's own words (「操作被拒绝：…」); the button is still the retry, and
pressing it clears the line. A failed read never leaves the page, so the line stands there instead of
walking away like a notification.

## Details

- `packages/web/src/features/company/overview-page.tsx`: a new `deskRefusal`; `openCeoDesk`'s `catch`
  writes it through `refusalText` instead of `toastError`. The sentence is drawn at the top of the
  body (`role="alert"`, danger ink, the whole text on hover); `openCeoDesk` clears it when it starts,
  and so does switching organizations — one organization's answer must not follow the reader.
- A brand-new organization hides that header button (its first step is the same call to action); the
  sentence lands in the same place for that button too.
- No new wording, no new dependency, no API changes.

## Tests

- `packages/web/e2e/overview-desk-refusal.spec.mjs` (new, 1 case, real server + the repository's mock
  model): the desk route answers 500 in its own words → the sentence is on the page, measured to start
  below the header button's bottom edge, absent from the notifications region, still there after seven
  seconds, and the URL has not moved; once the intercept is lifted, the same button lands in
  `/chat/<session>`. On the pre-change build this fails: the page has no such sentence, only a
  six-second notification.

## Compatibility

No route, storage format or wire type changed: the refusal is one client-side read.
