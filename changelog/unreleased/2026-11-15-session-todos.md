# A to-do list for the open conversation, at the sidebar's foot

- **Date:** 2026-11-15
- **Type:** feature
- **Scope:** `server`, `web`, `ui`, `core`, `docs`

[中文版](2026-11-15-session-todos.zh.md)

The sidebar's foot, just above the user row, gained a **To do** block: what the open conversation still has left to do. Its header reads *left / total*, the arrow at its end folds it away, a tick means done, an entry can be removed, and typing in the box at the bottom and pressing Enter adds one. Switching conversations shows that conversation's list — the block follows the open one only.

The list is not merely browser state: it is `TODO.json` in the conversation's scratchpad, the same kind of per-conversation file the goal plugin keeps in `GOAL.json`. The block and the agent read and write the same file — what you add here is there on its next turn, and what it adds as it works shows up when that turn ends, each thing it did being one entry on one list. The default system prompt gained a line telling it to keep that file when several things are still to do.

A write that fails does not pretend it landed: that one change is put back and says so in place, and **Try again** resends it. A list that could not be read says something different.

## Details

- `packages/server/src/services/session-todos.ts`, `packages/server/src/http/routes/sessions.ts`: new `GET`/`PUT /api/sessions/:sessionId/todos`. A missing (or unreadable) file reads as an empty list rather than a 404 — every conversation has the list, most simply never wrote one. `PUT` takes the whole list and answers with what actually landed. At most 200 entries of 500 characters; over that, or an entry that is not `{text, done}`, is a 400 naming the offending index, with the file left byte-for-byte untouched. A file the agent hand-wrote badly is read tolerantly: malformed entries dropped, long text truncated, so one bad file cannot take the block down.
- `packages/web/src/features/account/session-todos.tsx`: four pure functions (add, tick, remove, count what is left) and a `useSessionTodos` hook. A tick is optimistic and rolls back to what the server last confirmed when the write fails; the list is re-read when the conversation changes and when its run ends (which is when the agent's edits are all in), with no timer on an idle conversation.
- `packages/ui/src/components/shell/sidebar-frame/sidebar-frame.tsx`: `SidebarFrame` takes an optional `foot`, drawn ahead of the account row. Omitting it draws neither the block nor its divider — which is the case for a new conversation's draft, a draft having no conversation to keep a list for.
- `packages/core/src/state/default-config.ts`: the default prompt's # Suggested workflows gained a line telling the agent to keep what is left in `TODO.json` in the same scratchpad. The defaults changed, so the kernel version moved from `2026-10-05` to `2026-11-15`, with the old prompt hash appended to the previous generation.
- Copy lives in `account.todos` in `packages/web/src/lib/strings.ts` / `strings-en.ts`. The prose is in `packages/docs/content/web-app.zh.md` / `web-app.en.md` (the sidebar section) and the two new routes in `server-api.zh.md` / `server-api.en.md`.

## Tests

- `packages/server/test/session-todos.test.ts` (11): an empty file reading as an empty list; an agent's hand-written untidy file; a PUT round trip whose on-disk bytes match the serializer exactly; a missing directory created on write; six malformed bodies each a 400 that leaves the file alone; an unknown conversation a 404.
- `packages/web/test/session-todos.test.ts` (4): what the four pure functions do with their input.
- `packages/core/test/kernel-version.test.ts`: the pinned-hash guard over the changed default prompt, which is what requires the `2026-11-15` bump above.

## Compatibility

Purely additive: new routes, a new block, new copy. No new dependency, no database change, no Project config change. Existing conversations have no `TODO.json` and open on an empty list. Against a server that does not know the routes (a front end swapped on its own, say), the block reports that it could not read the list, right where it sits, and the rest of the sidebar is unaffected.
