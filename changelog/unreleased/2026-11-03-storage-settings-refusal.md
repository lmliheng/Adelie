# A refused cleanup-mode switch or pin says so beside the control, past the toast it used to be

- **Date:** 2026-11-03
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-03-storage-settings-refusal.zh.md)

Settings → Storage ledger has two writes on `StorageSettings`: the cleanup-mode switch, and each
bill row's "Pin / Unpin". Neither is optimistic — the switch always shows the position the server
answered with, and a refused pin leaves its button reading "Pin" — so a failure used to be a
six-second notification only: six seconds later the switch sat quietly where it was (or the button
still said "Pin") and nothing on screen said why. That switch is the gate on every other write this
page offers ("nothing moves without a review"), and the pin is what keeps a path off later bills.

Now the reason stays beside the control itself: the switch's line sits under the sentence that
describes its position and names the direction that failed ("on" / "off"); the pin's line sits under
that row's own button, in the button's words, with the path and the server's own reason. Both are
`role="alert"` and both stay until the next write of the same kind — the control itself is the retry.

## Details

- `packages/web/src/features/settings/storage-settings-refusal.ts` (new): `storageModeRefused(enabled,
  reason)` builds the switch's sentence (the direction comes from where this request was going, not
  from the position on screen); `storagePinRefused(path, pinned, reason)` builds the pin's sentence
  together with the path whose row draws it.
- `packages/web/src/lib/strings{,-en}.ts`: three sentences — the mode switch, pin, unpin — beside the
  wording of their own buttons, each naming the action that failed.
- `packages/web/src/features/settings/storage-section.tsx`: two states (`modeRefusal` / `pinRefusal`),
  cleared when a write starts and set when it is refused; `ModeRow` takes a `refusal` drawn under its
  status sentence; `BillRow` takes a `refusal` drawn under that row's button (`BillGroup` hands it to
  the row whose path it names). The failure notification stays: "Clean up" already reports a refusal
  both on the page and as a toast on this page, and this adds the account that outlives it.

## Tests

- `packages/web/test/storage-settings-refusal.test.ts` (new, 9): each direction of the switch, pin vs
  unpin wording, the path carried verbatim (spaces and colons included), the reason carried verbatim,
  and the interface language.
- `packages/web/e2e/storage-settings-refusal.spec.mjs` (new, two against a real server):
  - Cleanup mode: the settings PUT is stubbed to 500; clicking the switch draws "Turning the cleanup
    mode off was refused: …" under its status sentence while the switch stays on (it never moved);
    seven seconds later the sentence is still there; once lifted the same switch really turns the mode
    off and the sentence goes.
  - Pin: the bill listing is a fixture entry and that row's pin is stubbed to 500; clicking "Pin"
    draws the refusal under that row's own button, which still reads "Pin"; seven seconds later it is
    still there; once lifted the same button works, the button reads "Unpin" and the sentence goes.

## Compatibility

- No route, request or stored shape changed: the same `GET`/`PUT …/admin/storage/settings` and the
  same `POST …/plans/:id/pin`. What changed is only where a refusal is drawn — from "a notification
  only" to "one more account beside the control that asked".
