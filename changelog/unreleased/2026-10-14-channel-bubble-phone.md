# A channel message on a phone gets the width it needs

- **Date:** 2026-10-14
- **Type:** fix
- **Scope:** `ui`

[中文版](2026-10-14-channel-bubble-phone.zh.md)

Ported from upstream PenguinHarness (#826, commit `9eae0a2d`).

On a phone, a company channel's message bubbles were narrow and the time stamp squeezed the
words: Chinese wrapped at about seven characters a line. Two things changed:

- A bubble may take 88% of its column on a narrow screen (75% from the `sm` breakpoint up, as
  before). The column is already the avatar gutter short of the screen; three quarters of what
  was left was not enough.
- The time no longer sits in a column of its own beside the body. It ends the bubble: beside
  the words when a message fits on one line with it, and on a line of its own — right-aligned,
  under the last line — when the words need the width. The body keeps room for it on its last
  line (the last paragraph, list item or quote line ends in an inline gap of the time's width),
  and a block that cannot end in a gap (code, a table) gets the line under it instead. The body
  is `text-base` on a phone and `text-sm` from `sm` up, as before.

No API, wire format or stored data changes.
