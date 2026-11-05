# A scan-to-connect attempt that fails says why on its card, not in a six-second toast

- **Date:** 2026-11-05
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-05-scan-refusal.zh.md)

Both scan-to-connect cards — QQ's and WeChat's — end the same way after a failure: the QR comes down
(or, for WeChat's pairing code, stays up with its input), the button that asks again is still on
screen, and the reason arrived as one notification that dismissed itself after six seconds. Six
seconds later the card was exactly what it had been before the press, and nothing said the button
had been pressed at all — while that button is precisely the retry.

The reason now stays under the control that asked (`role="alert"`, danger colour, two lines with
the whole text on hover): under the scan button when the flow could not start or the poll loop gave
up, and under the pairing-code input when WeChat refused the digits. It is cleared by the next
attempt — the same button, or a submit — so it always describes the last thing that happened. A
request that never reached the route now reads its code's own localized sentence instead of the
server's English wording, the rule the app's other refusal slots already follow.

One answer deliberately keeps its toast: `already_bound`. Nothing failed there, there is nothing to
retry, and a QR that came down because the bot was already connected is news rather than a fault to
fix on the card.

## Details

- `packages/web/src/features/messaging/scan-refusal.tsx` (new): `scanStartRefusal(...)` — the
  sentence for a scan that never started, read through `refusalText`; `scanStopRefusal(...)` — the
  fault a stop step leaves on the card, or `null` for news; and `ScanRefusalLine`, which both cards
  draw so the two placements cannot drift apart.
- `packages/web/src/features/messaging/qq-scan-connect.tsx`: the card gains a `refusal` state,
  written where the two failures used to `toastError` (a start that was refused, a poll loop that
  gave up) and cleared by the next start and by cancel; the idle branch draws it under the button.
  `qqScanStep`'s failed-poll notice goes through `refusalText`.
- `packages/web/src/features/messaging/wechat-scan-connect.tsx`: the same state for the start and
  poll failures, plus the pairing code — a refused submit draws the sentence under the input, and
  the QR stays up because the code is still the thing being authorized. `wechatScanStep`'s
  failed-poll notice goes through `refusalText`; the `info` tone keeps its toast.

## Tests

- `packages/web/test/scan-refusal.test.ts` (new, 5 cases): a failed request reads through its code
  rather than the wire message; a client-raised error keeps its message; an empty value falls back
  to the generic sentence; each channel's own lead-in is used, in the interface language; a fault
  stays on the card while news returns `null`.
- `packages/web/e2e/scan-refusal.spec.mjs` (new, real server, real browser, 4 cases): a start the
  route refuses draws the line under the button, with no notification, and it is still there
  **seven seconds later**; the second press drops it and shows the code that attempt minted; a poll
  loop that fails three times takes the code down and leaves the reason (still there after seven
  seconds); WeChat's refused pairing code draws the line beside its input and editing the digits
  retires it.

## Compatibility

No interface change, no new dependency, no Project config change. The QQ and WeChat step
classifiers keep their shapes; only which words a failed poll produces changed, and only for an
error that is not the server's.
