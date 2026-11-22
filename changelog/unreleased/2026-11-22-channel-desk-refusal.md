# A desk the member popover could not open keeps its reason under the member row

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-22-channel-desk-refusal.zh.md)

The member popover in a channel's header lists everyone in the channel, and an employee's row carries
"打开工位会话" (open the desk session). When that request failed — the desk could not be reserved, the
organization was mid-write — the reason went into a notification that dismissed itself after six
seconds, over a panel the reader was still looking at. Afterwards the row was exactly as it had been,
with nothing saying the desk had not opened or why.

The reason now stays under the member row that asked: the panel keeps standing, that row's button is
the retry, and closing the panel takes the sentence with it, so reopening it is a clean question.

## Details

- `packages/web/src/features/company/channel-header.tsx`: `MemberPopover` owns the attempt
  (`opening`) and the refusal (`{principal, text}`) instead of the header owning a bare "which
  principal is opening" flag; a row's line is drawn only under its own principal (`role="alert"`,
  the danger ink), and `close()` clears it. `ChannelHeader`'s `openDesk` now resolves with the reason
  (`refusalText`) instead of saying it as a toast — the row that asked is where it belongs.

## Tests

- `packages/web/e2e/channel-refusal.spec.mjs` (+1 case, real server + real browser): the desk route
  answers 500 with its own words → the sentence is in the panel under the row's bottom edge (measured),
  absent from the notification region, still there after seven seconds, and the panel is still on
  screen with the URL unchanged; closing the panel and reopening it shows no sentence; the retry
  lands and the shell follows the same button into the session. Against the previous build the case
  fails: no line in the panel at all, the words went to the six-second notification.

## Compatibility

No route, stored format or wire type changed; the refusal stays on the client, and the desk request
itself is untouched.
