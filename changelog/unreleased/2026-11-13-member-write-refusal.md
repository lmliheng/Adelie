# A refused member write in Project settings keeps its reason in the table that asked

- **Date:** 2026-11-13
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-13-member-write-refusal.zh.md)

The Members page of the Project settings dialog begins and revokes access with ordinary writes, and
everything stays on screen when one is refused: the add box keeps the name that was typed, a
member's row keeps its 「移除」 button, so the same control is the retry. What was missing was the
reason — it arrived as a notification that dismissed itself after six seconds, above a table that
looked untouched. A member who had in fact NOT been removed looked exactly like one who had, and
the sentence that said otherwise was already gone. That is the rule every write refusal in the app
follows (the sentence belongs where the attempt was made), and this dialog's own General page
already keeps the same fact inside its delete card.

Both directions now leave the sentence above the table (`role="alert"`, danger ink, the whole
reason on hover), naming the account it was about — the page is a list, and two attempts in a row
name two different people — and saying the list did not change. Each attempt clears the sentence
from the attempt before it, a landed retry clears it too, and the toast is gone from this page.

## Details

- `packages/web/src/lib/member-write-refusal.ts` (new): `memberWriteRefused(write, error)` —
  `{ kind: "add" | "remove", userId }` plus the sentence, read through `refusalText` (an answer the
  server gave is spoken through its code's own localized words; a failure this codebase raised is
  shown as written; nothing to say falls back to the generic text). The write comes back with the
  sentence, because which one it was is what a reader retries.
- `packages/web/src/components/layout/project-dialogs.tsx`: `MembersSection` holds one refusal at a
  time and draws it above the table (`data-testid="member-refusal"`, `role="alert"`, two lines with
  the full text on hover); `addMember` / `doRemove` write it instead of calling `toastError`, and
  clear it at the start of every attempt. The page's own comment now says so.
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: `memberAddRefused` and
  `memberRemoveRefused`, in both dictionaries.

## Tests

- `packages/web/test/member-write-refusal.test.ts` (new, 5 cases): the account is named and the
  server's code — not its wire message — is spoken; an addition and a removal are not the same
  sentence; a failure raised before the request keeps its own words; a value with nothing to say
  falls back to the generic text; the active dictionary decides the language.
- `packages/web/e2e/member-write-refusal.spec.mjs` (new, 2 cases, real server + a real browser,
  both refusals the server's own): adding an account that does not exist answers 404
  `user_not_found` — the sentence is above the table, the table's row count does not change, the
  typed name stays, nothing lands in the notification region, the sentence is still there after
  seven seconds, and typing a real account into the same box lands the row and takes the sentence
  with it; removing a member somebody else just removed answers 404 `member_not_found` — the row
  and the sentence both stay, and the same button retries it once the membership is back.
- Against the page as it was before the change (rebuilt from `HEAD`'s `project-dialogs.tsx`), both
  cases fail on the missing refusal line; a two-state probe on the same page reads one notification
  at 1.2 s (「该用户已不存在。」) and an empty screen at 7.5 s, against the refusal line at both
  moments after the change.

## Compatibility

No API change, no new dependency, no stored format change. A write that lands behaves exactly as
before; what changed is a write that does not — it can no longer look as if it did.
