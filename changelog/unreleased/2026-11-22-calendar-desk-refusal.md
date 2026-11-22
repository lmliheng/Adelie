# A desk the calendar's edit dialog cannot open keeps its reason under the link

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-22-calendar-desk-refusal.md)

An event's edit dialog in the organization calendar offers 「打开工位会话」 on the last run that
fired — the desk session that run went to. Opening the desk is a read that creates it on the way
in, so it can be refused; the reason used to be a notification only. It sat over the dialog's own
title, dismissed itself after six seconds, and left the link's line looking exactly as it had
before the click — nothing said the desk did not open or why.

The reason now stays in the dialog, directly under the row the link lives on, prefixed with the
same 「操作被拒绝：」 sentence every other refusal slot uses. The link is the retry; closing the
dialog takes the reason with it, so reopening starts clean.

## Details

- `packages/web/src/features/company/calendar-page.tsx`: `openDesk` writes the reason into a new
  `deskRefusal` state through `refusalText` instead of raising `toastError`; the sentence is drawn
  under the metadata row (`role="alert"`, danger ink, tooltip for the full text), and both
  `openCreate` / `openEdit` clear it, since a dialog opening is a new question.

## Tests

- `packages/web/e2e/calendar-desk-refusal.spec.mjs` (new, 1 case, real server + real browser): the
  desk route answers 500 with its own words → the sentence is in the dialog, measured to start
  below the link's bottom edge, absent from the notification region, still there after seven
  seconds, the dialog still open and the address unchanged; closing and reopening the dialog
  leaves no reason behind; the same link then opens the desk and the shell follows it into the
  session. Against the previous build the case fails at the in-dialog sentence (it was a
  six-second notification: on screen at 800 ms, gone by 7 s).

## Compatibility

No route, stored format or wire type changed; the desk read and the dialog itself are untouched.
