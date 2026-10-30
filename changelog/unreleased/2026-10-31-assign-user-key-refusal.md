# A refused "assign a user key" keeps the key list, with the reason above it

- **Date:** 2026-10-31
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-31-assign-user-key-refusal.zh.md)

When a model group's "assign a user key" is refused (a 500, an unwritable config), the dialog showed
the reason — but it showed it **instead of** everything else: the entry already picked, and every
other entry one could pick, disappeared with it. A refusal left the person unable to see what they
had chosen or to choose anything else, with cancelling and starting over as the only way back.

The reason now stands **above** the list; the list and the pick stay exactly as they were, and 确认
is still the retry. A refusal writes nothing, so apart from one red line the dialog is the one the
person was already working in. Only a failed **read** of the user keys (where there is no list to
show anyway) leaves the reason on its own.

## Details

- `packages/web/src/features/models/models-page.tsx`: `AssignUserKeyDialog`'s body went from
  "reason / skeleton / empty / list" (one of four) to "reason (optional)" plus one of "skeleton /
  empty / list", the skeleton appearing only while nothing has arrived and nothing has failed. The
  comment says why the reason must not replace the list: the retry repeats exactly that pick.

## Tests

- `packages/web/e2e/models-assign-user-key.spec.mjs` (new, three browser cases): an account with no
  user keys is pointed at where they are added and 确认 has nothing to send; picking one global key
  writes it onto every model of the group (the mask the server reports is the proof), the custom
  group never offers the action, and the account's own table is read, not consumed; one refused copy
  keeps the dialog, the list and the pick while nothing is written — and the next 确认 really lands.
- Counter-proof: reverting that one source hunk and rebuilding the Web bundle turns exactly the
  third case red, red on "the checkbox is not in the dialog" (before the fix only the reason was),
  with the other two still green.

## Compatibility

- No API, on-disk or string-key change; the success path looks exactly as it did.
