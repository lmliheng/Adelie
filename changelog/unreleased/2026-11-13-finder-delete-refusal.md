# A refused folder removal keeps its reason inside the card that asked

- **Date:** 2026-11-13
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-13-finder-delete-refusal.zh.md)

Removing a folder in the Workspace finder is asked in a confirmation card, and that card states the
rule the server enforces: only an empty folder can be deleted. The card closed on the answer either
way, so a refusal — a folder that has something in it, which is exactly the case the card warns
about — was reported only as a notification that dismissed itself after six seconds. The folder was
still in the list, looking untouched, and the reason it survived was gone.

The card now closes only once its delete landed. A refusal leaves it standing with the server's
words inside it, in the shared card's `refusal` slot — `操作被拒绝：<reason>` under the sentence it
answered, above the same button that sent the request. That button is the retry: a folder emptied
from outside the card can be removed by pressing it again, with no way to lose the question in
between. The reason is cleared at the start of the next attempt and when the card is closed.

## Details

- `packages/web/src/features/chat/workspace-finder.tsx`: a `deleteRefusal` state beside
  `deleteTarget`. `deleteFolder` fills it from `refusalText` on a refusal instead of closing the
  card and toasting; it is cleared when the card is opened and when an attempt starts. The card
  passes the state to `refusal` as `S.common.refused(...)` and clears it in `onClose`.
- The successful path is untouched: the card closes, the finder re-reads the folder (or stands in
  the removed folder's parent when that folder was the one being browsed), and the success toast
  still reports what went.

## Tests

- `packages/web/e2e/finder-delete-folder-refusal.spec.mjs` (new, two cases, real server + the
  repository's mock model + a real browser, folders and files under the system temp dir): a folder
  that holds a file is refused with the app's own words in the card, nothing in the notification
  region, still there after seven seconds and nothing removed on disk — then the file is deleted
  from outside the card, the same button retries and the folder goes from the list and from disk;
  and a card closed with Escape after a refusal leaves the next card clean.
- Run against the page as it was before the change (`HEAD`'s source, rebuilt), both cases fail on
  the card's missing `role="alert"`.

## Compatibility

No wire change, no new dependency, no Project config change, no new copy: the sentence is the
existing app-wide `操作被拒绝：<reason>` and the words for `dir_not_empty` were already in the
dictionary. Deleting an empty folder and every other finder action are untouched.
