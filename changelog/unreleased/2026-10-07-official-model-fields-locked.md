# Web: a built-in model's endpoint and prices are read-only in its config dialog

- **Date:** 2026-10-07
- **Type:** feature
- **Scope:** `web`

[中文版](2026-10-07-official-model-fields-locked.zh.md)

The model config dialog let a built-in model's 自定义 base URL and its three price fields (cache
read / cache write / output) be typed over. Both belong to the built-in catalog: the entry ships
with the endpoint and the list price, and 同步预置 writes the catalog's own numbers back onto a row
whose stored ones have fallen behind. A retyped endpoint was the entry's credential — every later
turn went to whatever had been pasted there, with nothing in the app saying the row was no longer
the catalog's model.

Both now render read-only on a catalog row, with a line under the base URL field naming the reason
and the supported way out: 移到自定义分组 makes the row the user's own, and the two fields become
editable there. The lock follows the group actually selected — moving the row out of its group
unlocks them, retyping the id onto another catalog model keeps them locked, and retyping it off the
catalog unlocks them. Everything else on such a row stays editable: the API key, the context window,
the output cap, fast mode and the display name.

An official row is exempt from the base-URL-required rule: the field cannot be typed into, so
requiring it could only leave a row unsaveable, and the endpoint it asks for is the one the catalog
already states.

## Web

- `features/models/models-page.tsx`: the dialog's `official` rule (the current reference is in the
  catalog) disables the base URL input and the three price inputs, and explains the lock under the
  base URL field and in the fields' hover title.
- `lib/strings.ts` / `lib/strings-en.ts`: `models.officialLockedHint`.
