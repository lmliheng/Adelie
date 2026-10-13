# A channel keeps the message you have not sent

- **Date:** 2026-10-14
- **Type:** fix
- **Scope:** `web`

[中文版](2026-10-14-channel-draft.zh.md)

Ported from upstream PenguinHarness (#810, commit `7ecb60e1`).

Text typed into a channel's composer and not sent used to live only in the open view: opening
another channel, a desk or any other page — or reloading — threw it away. It is now kept per
user, Project, organization and channel in the browser (`penguin.channelDraft.…`), the way a
conversation's unsent input already was: coming back to the channel finds the text where it
was left, another channel does not inherit it, and sending the message (or emptying the box)
is what ends it. Nothing on disk or on the server changes, and the new key is classified as
install-scoped beside the chat drafts.
