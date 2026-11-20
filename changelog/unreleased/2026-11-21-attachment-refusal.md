# An oversize file the composer turns away now says so above the input, not just in a six-second toast

- **Date:** 2026-11-21
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-21-attachment-refusal.zh.md)

Picking an image, a clip or a file over its ceiling is refused **before the file is read**: no chip
appears and nothing is added to the draft. The only explanation was a notification over the top of
the page that dismissed itself after six seconds — after which the chip row simply lacked the file,
with nothing saying which file was turned away or what the limit is (7.19's rule: the sentence
belongs where the attempt was made, and the picker is one click away).

The reason is now drawn above the input card, at the top of the refusal stack (`role="alert"`,
`data-testid="attachment-refusal"`, danger colour, two lines, the whole sentence on hover), and it
stays until the **next** pick, paste or drop — never until a timer runs out.

## Details

The three ceilings are three different numbers: inline images (20MB) and inline clips (32MB) are
constants compiled into the server, while file attachments ride the admin-settable per-file limit.
One gesture can therefore cross two of them at once, so the sentence is grouped **per ceiling**,
naming the files each one refused:

- `packages/web/src/features/chat/attachment-refusal.ts` (new): `attachmentRefusalLine(rejected)` —
  an empty list returns `null` (which is also what clears the previous line); otherwise the ceilings
  are grouped in first-seen order, one sentence each, names kept in picking order.
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: `chat.attachmentTooLarge` now takes a list of
  names plus the ceiling; each dictionary joins the names its own way (Chinese `、`, English `, `,
  as everywhere else in the app) and English picks `exceeds/exceed` and `was/were` by count.
- `packages/web/src/features/chat/chat-input.tsx`: the three intakes (images / clips / attachments)
  and the four entry points (the two "+" pickers, paste, drop) now collect what was refused and
  write **one line** — a single drop carrying an oversized image and an oversized clip reads as two
  sentences in one line instead of the second replacing the first. The three `toastError` calls are
  gone; this file no longer reports refusals through notifications.

## Tests

- `packages/web/test/attachment-refusal.test.ts` (new, 5 cases): empty list → `null`; one file → one
  sentence; a batch under one ceiling → one sentence naming both in picking order; two ceilings →
  two sentences in first-seen order; switching to English changes both the sentence and the
  separator.
- `packages/web/e2e/attachment-refusal.spec.mjs` (new, 2 cases, real server + real browser):
  ① a picked 21MB image → one line above the card reading "shot.png exceeds the 20MB limit…",
  absent from the notifications region, no chip, draft untouched; **still there after seven
  seconds**; a 1MB image afterwards clears it and stages a chip; ② a drop of three files (21MB
  image + 33MB clip + 1KB text, a real `DragEvent` with a `DataTransfer`) → one line, two sentences,
  each with its own ceiling, nothing in the notifications region, and `notes.txt` staged as usual.
- **Counter-proof**: the same spec against the pre-change build (`r281/before-dist`, whose
  `index-*.js` has no `attachment-refusal`) → **both cases fail** (no `data-testid`).
- **Two-state probe** (one script, one leg per build): before, the sentence sits in the
  notifications region at 1s and is gone at 8s with nothing above the card; after, one line above
  the card at both 1s and 8s, notifications region empty.

## Compatibility

Renderer only: no API, wire format or stored data changed, and the server is untouched. The three
ceilings and the `>` comparison are unchanged.
