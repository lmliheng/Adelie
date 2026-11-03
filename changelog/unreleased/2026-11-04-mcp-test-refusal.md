# A refused MCP "test connection" says so under the button, not in a six-second toast

- **Date:** 2026-11-04
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-04-mcp-test-refusal.zh.md)

Agent settings → Tools → MCP Server's edit card has a "test connection" button that runs the form's
current (still unsaved) values. Every way that probe fails is a sentence the reader has to keep
while fixing the form: a command that is not on PATH, a URL that times out, a server whose stderr
tail names the certificate. All of them arrived as a notification only — it sits over the card and
dismisses itself after six seconds, while the card itself did not change one character: six seconds
later nothing on screen said the button had been pressed.

The sentence is now drawn in the card, directly under the button (`role="alert"`, danger colour,
two lines at most with the whole text on hover), and it stays until the form is edited or the next
probe starts — those fields are the connection it describes, and the same button is the retry. A
probe that *connects* keeps its toast with the tool count and latency (the models card's idiom): it
leaves nothing behind that needs explaining.

## Details

- `packages/web/src/features/agents/mcp-test-refusal.ts` (new, 44 lines): `mcpTestRefusal(answer)`
  turns one probe's answer into that line, or `null` when it connected. The three shapes of an
  answer each take their words by the existing rule (`refusalText`): the route's own detail (spawn
  error, timeout, stderr tail) travels verbatim; a failed request reads its code's localized
  sentence; an answer carrying no detail at all falls back to the generic text — an empty line
  under the button would say less than the toast it replaced.
- `packages/web/src/features/agents/mcp-servers-section.tsx`: one `testRefusal` state, cleared when
  a probe starts (it is that attempt's answer, not the card's standing state) and set when one is
  refused; the line is drawn under the row the button lives in. Any edit to the form, and opening
  another card, clears it, because the probe sent exactly those values. The connecting toast stays
  as it was; the now-unused `toastError` import goes.
- `packages/web/src/lib/strings{,-en}.ts`: **no new strings** — it reuses `mcpTestFail(detail)`
  ("Connection failed: …"), since the form in the card is the server being described.

## Tests

- `packages/web/test/mcp-test-refusal.test.ts` (new, 6 cases): a connecting answer leaves nothing
  (including "connected but exposed no tools") / the route's detail travels verbatim / a detail-less
  refusal falls back to the generic text / a failed request reads its code's localized sentence (the
  raw English never reaches the screen) / an error the client raised itself keeps its own words /
  the active language.
- `packages/web/e2e/mcp-test-refusal.spec.mjs` (new, two cases on a real server): the probe route is
  stubbed at `page.route` (a refusal, then the connecting answer once lifted). Case ①: after the
  refusal the line is in the card, the notification region holds nothing to dismiss, the card draws
  it exactly once, the probe request carried the form's two unsaved values, the form itself is
  untouched, and seven seconds later the line is still there. Case ②: editing one field drops the
  sentence; the same button retries and goes through — no line comes back, the connecting
  notification carries the tool count and latency, and the second probe travelled to the edited URL.

## Compatibility

- No interface, request or storage change: the same `POST …/agents/<agent>/config/mcp-test`, which
  saves nothing. Only where a refused one is drawn has moved — from a notification alone to a line
  under the button that outlives it.
