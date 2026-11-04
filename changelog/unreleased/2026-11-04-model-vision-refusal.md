# A vision probe that decided nothing says so under the vision switch, not in a six-second toast

- **Date:** 2026-11-04
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-04-model-vision-refusal.zh.md)

The model config dialog's "detect" control beside the vision switch spends the user's own credential
on one tiny image request. Its answer has three shapes: the model took the image (vision on), it
refused it (vision off), or nothing usable came back (the switch stays as the reader left it). The
first two moved the switch in front of the reader, and that movement is the whole account of the
press. The third wrote nothing at all — so the reason was the only trace of the press, and it used to
arrive as a notification: it sat over the dialog, dismissed itself after six seconds, and left a form
that looked untouched. The three things it names (the API key, the base URL, the model id) are all in
that same dialog, which is exactly what the reader is about to change.

That sentence is now drawn in the dialog, directly under the vision switch's row (`role="alert"`,
danger colour, two lines at most with the whole text on hover), and it stays until the form is edited
or the next press starts. The two decided answers keep their toast: the switch they moved already
says what was learned.

One wrong subject goes with it: both failures used to borrow protocol detection's sentence ("could not
detect the protocol, check the API key and the base URL") though the press was about images. They now
open with "vision probe failed:" and relay the route's own truncated upstream text, which is the part
that actually diagnoses the failure and used to be hidden behind the generic line. A request that never
reached the route (a 500 from the server, an expired login, a dropped connection) reads the localized
sentence for its error code instead — the rule the other two probes in this dialog and every other
refusal slot in the app follow (7.19). A form with no model id never asks the route, but the press
still has to explain itself, so the same line says to fill the id in.

## Details

- `packages/web/src/features/models/vision-refusal.ts` (new, 54 lines): `visionProbeRefusal(press)`
  turns one press into that line, `null` for either decided answer. Three shapes: no model id (the
  route must not be asked), the route answered (took it / refused it / learned nothing), and the
  request itself failed. A press that learned nothing relays `message` (the upstream text the route
  truncated) and falls back to the generic text when there is none — an empty line under the control
  would say less than the toast it replaced. A failed request goes through `refusalText` (7.19's
  app-wide rule).
- `packages/web/src/features/models/models-page.tsx`: one `visionRefusal` state — cleared at the start
  of every press and on every edit (the sentence describes the form it was sent), set when there is no
  id to probe or when nothing was learned. The line is drawn below the switch row and above the
  standing "read through the vision proxy model" hint, i.e. adjacent to the control that was pressed.
  `detectVisionFromButton`'s three failure paths write that line instead of raising a toast; the two
  decided answers keep theirs.
- `packages/web/src/lib/strings{,-en}.ts`: one new string, `detectVisionFailed(detail)` ("视觉检测失败：…"
  / "Vision probe failed: …") — the borrowed `detectFailedBody` is about the protocol and cannot be
  reused; `detectVisionNeedsId` and the error-code table supply the rest.

## Tests

- `packages/web/test/vision-refusal.test.ts` (new, 9 cases): accepted leaves nothing / refused leaves
  nothing / learned-nothing relays the upstream text as-is / no detail falls back to the generic text /
  the protocol sentence is no longer used / a failed request reads its code's sentence (raw English
  never reaches the screen) / an error the client raised itself keeps its own words and nothing at all
  falls back to the generic text / no model id says what is missing / the active language.
- `packages/web/e2e/models-vision-refusal.spec.mjs` (new, two cases on a real server): the probe route
  is stubbed at `page.route` — it bills a real provider. Case ①: a `failed` answer carrying upstream
  text draws that line under the switch, the notification region holds nothing to dismiss, the probe
  carried the form's provider / model id / base URL, nothing was written, and seven seconds later the
  line is still there; editing a character drops it. Case ②: a request that failed on the way out — a
  coded 500 — reads `视觉检测失败：服务器内部错误，请稍后重试。` rather than advice about the protocol, while
  the probe carried the unsaved `sk-probe`; once let through, the same button retries, the line goes,
  the "accepts images, vision turned on" toast appears, the switch is on, and the probe ran twice.

## Compatibility

No interface change, no new dependency, no Project config change. Two dictionaries gain one string
each; the mis-subject sentence ("could not detect the protocol…") stays where it belongs, in protocol
detection.
