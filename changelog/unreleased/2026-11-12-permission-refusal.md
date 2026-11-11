# A refused permission pick keeps its reason above the input card

- **Date:** 2026-11-12
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-12-permission-refusal.zh.md)

The composer's permission button writes both halves of a Session's permission in one PATCH — the
approval mode and the Session's own sandbox policy. The button shows the pick straight away and then
re-reads the Session once the write settles, so a refusal changes nothing on screen: the button goes
back to the level it read before, and nothing was written (the route checks every field before it
writes any). The reason used to live only in a notification above the page that dismissed itself
after six seconds — a click that looked as though it had never registered.

Now the sentence is drawn above the input card, in the thinking level's slot:
`没能切换权限（会话仍是原来的权限）：<reason>`. It stays until the next pick — that permission button is
the retry — and nothing is toasted for it any more.

## Details

- `packages/web/src/features/chat/permission-refusal.ts` (new): `permissionRefused(error)` builds the
  sentence through `refusalText` (the app-wide refusal rule, 7.19) and says the Session still holds
  the permission it had — the fact a reverted button cannot show on its own.
- `packages/web/src/features/chat/chat-page.tsx`: `onChangePermission` records the refusal in
  `permissionRefusal` (keyed by sessionId, so switching conversations never carries it over) and
  clears it at the start of every attempt; this path no longer calls `toastError`.
- `packages/web/src/features/chat/chat-input.tsx`: `ChatInput` takes an optional `permissionRefusal`
  and draws it above the card (`role="alert"`, danger colour, two lines, the whole sentence on
  hover), beside `thinkingRefusal`.
- `packages/web/src/lib/strings{,-en}.ts`: one sentence per language.

## Tests

- `packages/web/test/permission-refusal.test.ts`: the sentence goes through `refusalText` rather than
  the wire message, keeps what a write that never reached the route has to say, falls back to the
  generic text, names the unchanged permission, and follows the active language.
- `packages/web/e2e/permission-refusal.spec.mjs`: a real server and a real browser — the refused pick
  leaves the sentence above the card with nothing in the notification region, still there after seven
  seconds, with the button back on "always ask" and the stored Session still `always-ask`; the same
  button retried writes, the sentence goes, the button reads "allow all" and the server follows.

## Compatibility

No wire change, no new dependency, no Project config change. The thinking level's sentence on the
same page, successful writes and every other notification are untouched. A pick made from the Agents
dock panel is the same write, so its refusal lands in the same place; while the panel covers the
composer, that control still reads the old level and is the retry.
