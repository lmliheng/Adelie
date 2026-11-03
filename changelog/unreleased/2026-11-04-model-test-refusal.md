# A refused model "test connection" says so under the buttons, not in a six-second toast

- **Date:** 2026-11-04
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-04-model-test-refusal.zh.md)

The model config dialog's "test connection" button runs the form's current — still unsaved — values
past the server and saves nothing. Every way that probe fails is a sentence the reader has to keep
while fixing the same form: a wrong key, a base URL that answers nothing, an id whose group cannot
route it. All of them arrived as a notification only — it sits over the dialog and dismisses itself
after six seconds, while the form did not change one character: six seconds later nothing on screen
said the button had been pressed.

The sentence is now drawn in the dialog, directly under the row of buttons (`role="alert"`, danger
colour, two lines at most with the whole text on hover), and it stays until the form is edited or
the next probe starts — those fields are what the probe was sent, and the same button is the retry.
A probe that *connects* keeps its toast with the latency (it leaves nothing behind to explain), and
so does an entry its group cannot route: that one keeps the advice instead of the route's own
vocabulary, with the relayed sentence going to the console.

## Details

- `packages/web/src/features/models/model-test-refusal.ts` (new, 60 lines): `modelTestRefusal(answer,
  fix)` turns one probe's answer into that line, `null` for a connecting one. Three shapes, each
  following a rule the app already has: a failed request reads the localized sentence for its error
  code (`refusalText`), an answer with no detail falls back to the generic text (an empty line under
  the button would say less than the toast it replaced), and a routable entry that failed relays the
  route's own sentence — which is what makes a wrong key or a wrong endpoint diagnosable. `fix`
  (from `unroutableFix`, judged on the form at press time) replaces that sentence with the advice the
  entry's own shape calls for.
- `packages/web/src/features/models/models-page.tsx`: one `testRefusal` state — cleared when the
  probe starts and on every edit (the probe sent exactly the values the sentence describes), set
  when the answer was a refusal. The line is drawn under the button row; the success toast and the
  console copy of a relayed unroutable sentence are unchanged.
- `packages/web/src/lib/strings{,-en}.ts`: **no new copy** — it reuses `testFailed(detail)` /
  `testStalePin` / `testNotRoutable`, the sentences the card's own status line already uses.

## Tests

- `packages/web/test/model-test-refusal.test.ts` (new, 7 cases): a connecting answer leaves nothing /
  the route's detail travels verbatim / a detail-less answer falls back to the generic text / a
  failed request reads its code's localized sentence (raw English never reaches the screen) / an
  error the client raised itself keeps its own words / both pieces of routing advice replace the
  route's sentence, whatever shape the answer had / the active language.
- `packages/web/e2e/models-test-refusal.spec.mjs` (new, two cases on a real server): the probe route
  is stubbed at `page.route`. Case ①: an answer that failed upstream draws the route's sentence under
  the button row, the notification region holds nothing to dismiss, nothing was written, the form is
  untouched, and seven seconds later the line is still there; editing a field drops it. Case ②: a
  request that failed on the way out — a coded 500 — reads in the app's words while the probe carried
  the form's unsaved key (`sk-probe`); once the route is let through, the same button retries, the
  line goes, and the latency toast appears instead.

## Compatibility

- No interface, request or storage change: the same `POST …/models/test`, which saves nothing. Only
  where a refused one is drawn has moved — from a notification alone to a line under the buttons
  that outlives it.
