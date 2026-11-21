# A day that fails to page back in a channel now says so under its button, not just in a six-second toast

- **Date:** 2026-11-21
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-21-channel-earlier-refusal.zh.md)

Pressing "Earlier days" in a channel is one more day of history being read. When that day did not
come back nothing on screen changed: every day already held stayed, and the button stayed where it
was — the only explanation was a notification over the top of the page that dismissed itself after
six seconds. Six seconds on, the stream was simply missing a day, with nothing saying whether the
press had even happened (7.19's rule: the sentence belongs where the attempt was made, and the
button is the retry).

The reason is now drawn directly under the button (`role="alert"`,
`data-testid="channel-earlier-refusal"`, danger colour, two lines, the whole sentence on hover), and
it stays until the **next** press or a channel switch — never until a timer runs out.

## Details

- `packages/web/src/features/company/channel-earlier-refusal.ts` (new):
  `channelEarlierRefusalLine(err)` — the interface's lead-in plus the reason, the reason taken by
  `refusalText`'s rule (the dictionary's sentence for a code it knows, the server's own words
  otherwise; organization reads mostly answer in codes this app has no sentences for, so the
  fallback does real work here).
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: new `company.channels.earlierRefused`
  ("Earlier days could not be loaded: …"), the same shape as the neighbouring `sendRefused`.
- `packages/web/src/features/company/channel-view.tsx`: `loadEarlier`'s `catch` no longer toasts —
  it records one sentence; every press clears the previous one first, a channel switch clears it with
  the rest of the stream state, and the button row became a centred column so the sentence sits
  under the button (the stream is below it, so the sentence lands between the two). The `toastError`
  import is gone.

## Tests

- `packages/web/test/channel-earlier-refusal.test.ts` (new, 5 cases): a code the dictionary knows →
  its sentence; an unknown code → the server's own words; a sentence this codebase raised → as
  written; nothing to say → the generic sentence; switching to English moves the lead-in too.
- `packages/web/e2e/channel-earlier-refusal.spec.mjs` (new, 2 cases, real server + real browser):
  ① the first screen fills its seven-day budget and the eighth stays behind the button → pressing it,
  with the server answering 500 (code `internal`), draws "Earlier days could not be loaded: …"
  directly under the button, one `role=alert`, absent from the notifications region, the button still
  there and clickable; **still there after seven seconds**; with the interception removed the next
  press clears it and that day's message joins the stream; ② switching to the all-hands channel and
  back shows the sentence does not follow the reader.

## Compatibility

Renderer only: no API, wire format or stored data changed, and the server is untouched. Paging still
reads one day per press.
