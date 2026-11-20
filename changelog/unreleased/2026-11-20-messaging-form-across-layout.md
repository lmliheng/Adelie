# A layout change keeps unsaved edits in the messaging panel

- **Date:** 2026-11-20
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-20-messaging-form-across-layout.zh.md)

The messaging panel ("remote control" tab) is a dock panel: when the window crosses the breakpoint
(the desktop side column ↔ the narrow merged surface) it moves from one mount point to the other,
and the old body is torn down for a fresh one. The fresh body reads the bindings back from the
server — which never held an unsaved edit — so a bot token just pasted in, an App ID just typed, a
channel just switched to were gone, and the reader had to type them again. Measured in a real
browser: with both fields filled, a 390-wide read came back `""` / `""`, and so did the read after
crossing back to 1280.

The panel now carries what the reader typed across, on the same rule as the Files, Memory and Trace
panels: **only a layout move hands it back**. Closing the tab and opening it again, or switching to
another conversation and back, still starts from the server's answer.

## Details

- `packages/web/src/features/messaging/messaging-form-keep.ts` (new): one record per conversation —
  the surface the edits were left on and the form itself. Handed back only to a body on a
  *different* surface; copied on the way in and out; also exports `sameMessagingForm` (a whole-form
  comparison rather than `formDirty` — that one judges the *selected* channel, while a reader may
  have pasted a Feishu token and then switched to QQ to look at it).
- `packages/web/src/features/messaging/messaging-binding-editor.tsx`: `useMessagingBinding` takes an
  optional `surface`; the initial load keeps the server's form as the baseline and shows the
  recorded one (so those edits still read as unsaved and still have to be saved, as before the
  move); an effect writes the record on every change — a form equal to the server's (nothing typed,
  or just saved) deletes it, so "nothing changed" is never remembered as a place.
- `packages/web/src/features/messaging/messaging-panel.tsx`: the panel passes `surface` to the hook.
- `packages/web/src/features/chat/builtin-dock-panels.tsx`: the messaging tab's body reads its
  surface from `useDockPanel()` (`merged ? "merged" : position`), as the other panels do.
- The dialog host (`messaging-binding-modal.tsx`) passes no `surface`: it neither reads nor writes
  the record, so one conversation's unsaved text never lands in a popup opened for it.

## Tests

- `packages/web/test/messaging-form-keep.test.ts` (new, 7 cases): handed back only from another
  surface; nothing for a conversation never typed into; both directions; dropped when told; copied
  in and out; compared whole (a filled Feishu form counts while QQ is selected).
- `packages/web/e2e/messaging-form-across-layout.spec.mjs` (new, 3 cases): ① both fields filled,
  1280 → 390 → 1280 reads the typed values on both sides; ② switching to QQ and typing its App ID
  comes back on QQ with the value; ③ closing the tab and reopening starts over, and the crossing
  after that has nothing to hand back (the guardrail).
- **Counter-proof (same spec, pre-change build)**: 2 failed — ① `{appId:"", secret:""}` at 390;
  ② `{onQQ:"", qqPicked:"false"}`. The third passes before the change too (it is the guardrail).
- Two-legged probe (one script, each leg types once): after, all three readings hold
  `cli_before_probe` and the secret; before, the 390 reading and the one after crossing back are
  both empty.

## Compatibility

Frontend state only: no API, wire format or stored data changes. The record lives in memory, so a
reload still starts from the server's answer (as before).
