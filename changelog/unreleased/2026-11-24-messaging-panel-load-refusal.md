# A Messaging panel that cannot read its settings keeps the reason, with the retry under it

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

The conversation's **Messaging** panel in the right dock reads this Session's bindings before it
can show anything. When that read was refused (the Session is gone, the reader lost access, a 500,
the machine is unreachable) the only account was a notification that dismissed itself after six
seconds, while the panel went on drawing two loading skeletons — which says "still reading" about a
request that had already come back. The sentence now stands where the form would have been, and the
**Retry** under it is that read itself: pressing it reads again, and the form replaces the sentence
when it lands.

## Details

- `packages/web/src/features/messaging/messaging-load-refusal.ts` (new): `messagingLoadRefusal()`
  answers `{ text, toast }` — `text` is the interface's own sentence (`S.messaging.loadRefused(...)`
  around `refusalText`, so the server's English wire message never reaches the screen), and `toast`
  belongs to hosts that do not draw it themselves (the dialog opened from a Session row closes on a
  failed read, so a notification is all its reader can be left with).
- `packages/web/src/features/messaging/messaging-binding-editor.tsx`: the hook gains `loadRefusal`
  and `reload()`. A failed initial read records the sentence (and lets `saysLoadRefusal` — through
  the pure function — decide whether a toast accompanies it); a read that lands clears it. `reload()`
  forgets the "this Session is already loaded" mark and re-runs the initial read — the failed one set
  that mark on purpose, so the poll would not spin against a server that keeps saying no.
- `packages/web/src/features/messaging/messaging-panel.tsx`: while the form has not arrived, a
  recorded sentence draws a `NoticeStrip` (`role="alert"`, danger tone) with a **Retry** button under
  it, and only a panel with no sentence shows the skeletons. It passes `saysLoadRefusal: true`, so
  the same sentence is not repeated as a notification.
- Both dictionaries gain `messaging.loadRefused`.
- `packages/web/test/messaging-load-refusal.test.ts` (new, 5 cases): the code's own localized
  sentence, the server's English message never leaking, the toast kept by default, the toast dropped
  for a host that says it draws the line, the fallback when the failure says nothing, both languages.
- `packages/web/e2e/messaging-panel-load-refusal.spec.mjs` (new, 2 tests, real server + real
  browser): only `GET …/messaging` is answered with a 500 → exactly one sentence in the panel, no
  skeletons, no form fields, nothing in the notification area, still there after seven seconds, the
  retry present; with the stub lifted, pressing Retry brings the form (its App ID is the stored one),
  clears the sentence and the button, and the read really went back to the server.

## Compatibility

Only where a failed read is drawn changed, plus one button. The interface, the data root and the
success path are unchanged, and the dialog opened from a Session row behaves as before.
