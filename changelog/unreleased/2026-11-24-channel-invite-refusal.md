# A refused invite keeps its reason under that candidate's row

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

[Chinese](2026-11-24-channel-invite-refusal.zh.md)

The channel header's invite picker used to close on the click, with the write starting afterwards —
a refusal then fell into a toast that dismissed itself after six seconds and sat outside the picker.
Once it was gone there was no reason on screen and no row left to retry from: inviting that person
again meant opening the picker and finding him a second time. The picker now stays open until the
write lands; a refusal leaves it standing, the query still typed, the server's words under that
candidate's row — and the same row is the retry.

## Details

- `packages/web/src/features/company/channel-header.tsx`: `InvitePicker` keeps its own `refusal`
  `{ principal, text }`, and `onPick` now resolves with the server's words (or `null` once the write
  landed); each attempt clears the previous sentence (one attempt, one reason), and only a landed
  invite closes the picker and clears the query. The sentence uses the same shape as the member
  popover's "open desk" answer (`role="alert"`, `toneInk.danger`) and is drawn under the candidate
  who was clicked; closing the picker takes it with it.
- The picker is keyed by channel id: another channel is another candidate list, and a sentence left
  in the previous one has no business following it.
- New e2e `packages/web/e2e/channel-invite-refusal.spec.mjs` (2 tests): a refusal keeps the picker
  open with the reason under that row (measured), the notification region does not carry the words,
  the sentence is still there seven seconds later, and the server's roster is unchanged; closing and
  reopening is clean, and the retry lands from the same row. The second test walks the success path:
  the picker closes, the toast names who joined, the member count follows, and reopening no longer
  offers him.

## Compatibility

Only where a failure is drawn and when the picker closes changed. Routes, the data root and the
success-path messages are untouched.
