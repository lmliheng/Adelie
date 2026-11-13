# Ending a terminal the server refused keeps its reason in the card that asked

- **Date:** 2026-11-13
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-13-terminal-kill-refusal.zh.md)

Both ways to end a shell — a dock tab's × and the terminal.close shortcut (⌃⌥` / Ctrl+Alt+`) in a
standalone `/terminal` window — ask first in a confirmation card, because ending a shell cannot be
undone. Both then ignored the answer: the kill was sent and forgotten (`void killTerminal(...)`),
and that call neither read a non-2xx response nor reported a dropped connection. So a refused kill
removed the tab, or closed the window, while the shell kept running on the server, and the screen
said nothing at all — not even the six-second notification the other refusals used to get. The list
also dropped the entry before the round trip and never gave it back.

Now a kill the server refuses hands the entry back and says why inside the card that asked, in the
shared `refusal` slot (`操作被拒绝：<reason>`): the tab stays in the strip (or the window stays open,
because it is the only surface that shell is on), the server's own words are drawn under the
card's sentence, and the card's own button is the retry. The tab leaves only once the kill landed.

## Details

- `packages/web/src/features/terminal/terminal-list.ts`: `killTerminal` sends the DELETE through
  the app's API client instead of a bare `fetch`, so a non-2xx response becomes the usual
  `ApiError` (its code localized like every other refusal) and a dead connection becomes
  `network_error`; on either, the entry is put back, the pending-kill marker is dropped and the
  list is re-read — a 404 for a shell that really is gone takes it away again, which is the outcome
  the user asked for. The DELETE still addresses the machine that holds the pty.
- `packages/web/src/features/dock/dock-panel.tsx`: the kill card keeps a `killRefusal`; the tab is
  removed and the card closed only after the kill resolved. The reason is cleared when the card
  opens and when it closes.
- `packages/web/src/features/terminal/terminal-page.tsx`: the standalone window does the same, and
  a refusal no longer closes the window over a shell that is still running.
- The dictionary gains one code: `terminal_not_found` (the DELETE's own 404), in both languages.

## Tests

- `packages/web/test/terminal-kill-refusal.test.ts` (new, four cases, the node suite's one `fetch`
  fake): a refused DELETE puts the entry back and rejects with the server's code; a dropped
  connection is a `network_error` and does the same; a kill that landed leaves the entry out and
  addresses the machine that holds the pty; a 200 with a body is not a failure.
- `packages/web/e2e/terminal-kill-refusal.spec.mjs` (new, three cases, real server + the
  repository's mock model + a real browser): the dock card keeps `terminal_not_found`'s sentence,
  the tab and the live shell, with nothing left in the notification region and everything still
  there after seven seconds — then the same button retries and the kill lands (204), the tab leaves
  and the shell is gone; a card closed with Escape after a refusal leaves the next one clean; and
  the standalone window keeps its own refusal (`internal`) on screen, still attached to the shell,
  then ends it on the retry.
- Run against the page as it was before the change (`HEAD`'s source, rebuilt): all three cases fail
  on the card's missing `role="alert"`.

## Compatibility

No wire change, no new dependency, no Project config change. Every successful kill behaves exactly
as before — the entry leaves the list immediately and the tab leaves once the server confirmed;
what changes is a kill that never happened, which no longer looks like one that did.
