# A model "detect" that finds no protocol says so under the base URL field, not in a six-second toast

- **Date:** 2026-11-04
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-04-model-detect-refusal.zh.md)

The model config dialog's "detect" button probes the base URL the form currently holds (with the key
typed into it, if any) and writes nothing: a hit fills in the protocol, a miss leaves the form
exactly as it was. So a miss is one sentence the reader has to keep while they fix the two things it
names — the API key and the base URL, both on that same screen — and it used to arrive as a
notification only: it sat over the dialog, dismissed itself after six seconds, and left a form that
looked untouched with nothing on it saying the button had been pressed at all.

That sentence is now drawn in the dialog, directly under the base URL field (`role="alert"`, danger
colour, two lines at most with the whole text on hover), and it stays until the form is edited, a
protocol is picked by hand, or the next detection starts. A hit keeps its toast (the field's own
suffix already shows where the protocol ended up), and so does the save-time fallback note: that one
reports a save that went through, not a refusal.

One wrong diagnosis goes with it: a request that never left the browser (a 500 from the server, an
expired login, a dropped connection) used to read "check the API key and the base URL" as well,
though neither field may be at fault. It now reads the localized sentence for its error code — the
same rule the "test connection" button in this same dialog follows.

## Details

- `packages/web/src/features/models/detect-refusal.ts` (new, 47 lines): `detectProtocolRefusal(press)`
  turns one press into that line, `null` for a press that found a protocol. Three shapes: the route
  answered without a protocol, the URL never left the browser (`detectableBaseUrl`), and the request
  itself failed. The first two share the sentence that has always named the API key and the base URL —
  the finer per-probe differences are invisible from outside, and wording one of them as "the endpoint
  responded" read as success. The third follows `refusalText`'s rule (7.19's, app-wide).
- `packages/web/src/features/models/models-page.tsx`: one `detectRefusal` state — cleared when a
  manual run starts and on every edit or manual pick (the sentence describes that run's URL, key and
  id), set when nothing was found. The line is drawn under the base URL field, after any validation
  error and before the read-only lock note; `failed()` takes a press instead of raising a toast, and
  the save path's `detectFellBack` note is unchanged.
- `packages/web/src/lib/strings{,-en}.ts`: **no new copy** — it reuses `detectFailedBody` plus the
  sentences the error-code table already holds.

## Tests

- `packages/web/test/detect-refusal.test.ts` (new, 6 cases): a hit leaves nothing / an answer with no
  protocol keeps the sentence naming the key and the URL / a URL that never left the browser says the
  same / a failed request reads its code's localized sentence (raw English never reaches the screen,
  and the "check your key" advice is not used) / an error the client raised itself keeps its own words
  and nothing at all falls back to the generic text / the active language.
- `packages/web/e2e/models-detect-refusal.spec.mjs` (new, two cases on a real server): the probe route
  is stubbed at `page.route`. Case ①: an answer naming no protocol draws the sentence under the base
  URL field, the notification region holds nothing to dismiss, the probe carried the form's URL,
  nothing was written, and seven seconds later the line is still there; editing a character drops it.
  Case ②: a request that failed on the way out — a coded 500 — reads in the app's words rather than as
  advice to check the key, while the probe carried the unsaved `sk-probe`; once let through, the same
  button retries, the line goes, and the "detected … protocol, applied" toast appears instead.

## Compatibility

- No interface, request or storage change: the same `POST …/models/detect`, which saves nothing. Only
  where a miss is drawn has moved, and a failed request now reports its own error code.
