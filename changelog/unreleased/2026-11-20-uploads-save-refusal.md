# A refused upload-limits save keeps its reason in the form, not in a six-second toast

- **Date:** 2026-11-20
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-20-uploads-save-refusal.zh.md)

The two numbers under Settings → Server → Upload limits are written by a single PUT. The pair's own
rejection (`invalid_attachment_limit`) already drew under both inputs; every other way the save can
fail — a lost session, a dead server, a 500 — arrived as a notification that dismissed itself after
six seconds, over two fields that still held what was typed and a Save button that was the retry.
Nothing in the form said the save had not happened, so a reader who had looked away could not tell
"not saved" from "saved".

That refusal now draws in the form itself, right above the Save row, the way the proxy and speech
sections beside it do (7.19's rule: the sentence belongs where the attempt was made), and which
sentence goes to which slot is still a pure function with a test.

## Details

- `packages/web/src/features/settings/uploads-save-refusal.ts` (new): `uploadsSaveRefusal(error)`
  returns `{ slot, text }` — `invalid_attachment_limit` goes to `fields` (under both numbers,
  marked together), everything else to `section` (the form as a whole). The words come from
  `refusalText`.
- `packages/web/src/features/settings/uploads-section.tsx`: `save()`'s `catch` uses it and the
  `toastError` there is gone; a new `refusal` state is drawn above the Save row, cleared before each
  attempt and whenever the stored pair is adopted; the form-wide slot uses the shared lead-in
  (`S.common.refused`) that says what the sentence is about, as the neighbouring pages do.

## Tests

- `packages/web/test/uploads-save-refusal.test.ts` (new, 5 cases): the pair's own code goes to
  `fields` and speaks the interface's language rather than the wire's English; any other answer goes
  to `section`; a failure that never reached the route keeps its own words; a value with nothing to
  say falls back to the generic text; switching to the English dictionary moves both slots.
- `packages/web/e2e/uploads-save-refusal.spec.mjs` (new, 2 cases, real server + real browser):
  ① a refused save (PUT answered 500 `internal` via `page.route`) draws the sentence in the form,
  once, with no notification, still there after seven seconds, leaves both stored numbers untouched
  and the typed values in place, and the retry lands; ② a total below the single-file cap (the real
  server's `invalid_attachment_limit`) draws under the two numbers with nothing in the form-wide
  slot, no notification, and nothing written.
- **Reverse test**: the same spec against the pre-change build (source reverted to `HEAD` and
  rebuilt) fails ①: one notification in the stack and no sentence in the form.

## Also in the same slot family

The speech section (Settings → Server → Speech input) now decides which slot a refusal goes to with a
pure function of the same shape (`asr-save-refusal.ts`, 5 unit cases, one 3-case spec). It used to
raise a notification as well when the refusal was not an `ApiError` — but `apiFetch` wraps even a
network failure in an `ApiError`, so that branch never ran (measured on the pre-change build: the
sentence was in the form and the notification stack held nothing), and removing it changes no
behaviour. The one visible difference on those two pages is the shared lead-in
(「操作被拒绝：…」), which now matches the sections beside them.

## Compatibility

Front-end rendering only: no API, wire format or stored data changed, and the server was not
touched.
