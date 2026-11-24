# The 待做 list in the sidebar no longer keeps the previous conversation's entries

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-24-session-todos-switch.zh.md)

The to-do block at the sidebar's foot belongs to one conversation at a time (`TODO.json` in that
Session's scratchpad), but both of its async answers could paint it somewhere else. Tick an entry or
add one in conversation **one**, then open conversation **two**, and the write's late answer would
paint conversation one's list over conversation two — the reader sees "the 待做 did not change" after
switching, and any tick they then make in conversation two is written to the right file while the
screen shows the wrong one. The other way was quieter: when the new conversation's list failed to
read (a Session the server cannot find, say), the previous conversation's list stayed on screen with
only a "could not read" line under it, though the code's own comment promised a failed read leaves
an empty list.

The block now shows the open conversation's list or nothing at all: a write whose answer arrives
after the conversation moved on is dropped whole (it belongs to the conversation it was written
for); a failed read clears the list and leaves only the reason and the retry; and a read still in
the air keeps the block open instead of folding it shut and popping it back open. The list is still
re-read when it should be — on a switch, and when the open conversation's run ends.

## Details

- `packages/web/src/features/account/session-todos.tsx`: `useSessionTodos` keeps the list and the
  conversation it belongs to in one piece of state (`TodosState`), and renders only it when that
  conversation is the open one. The write's `then`/`catch` first compare a ref holding the
  conversation that is open now, and return when they differ — on the failure side too, where the
  old `catch` would otherwise lay the previous conversation's confirmed list back down. The failed
  read now stores an empty list, honouring the comment that says so. A new `loading` (the open
  conversation's list is not here yet) is what keeps the block open across a switch.
- No API, storage format or copy changed; no server file touched.

## Tests

- `packages/web/e2e/session-todos-switch.spec.mjs` (new, 3 cases, real server + real browser):
  ① the plain switch — conversation one's entries go, conversation two's arrive; ② **a late write**
  — conversation one's `PUT` is held on the wire for 3 seconds, an entry is ticked and the second
  conversation opened at once, and what is on screen after that answer lands is still the second
  conversation's list (before the fix this case showed the first conversation's list — reproduced);
  ③ **a failed read** — the second conversation's `GET` answers 500, the block shows "could not read
  this conversation's to-do list", and neither conversation's entries are shown (before the fix the
  first conversation's entries stayed).
- `@adelie/web`'s `tsc --noEmit`, `oxlint` and `prettier --check` pass, and the full unit suite
  passes.

## Compatibility

One component's internal state ownership; no API, storage or copy touched, and no other page
affected.
