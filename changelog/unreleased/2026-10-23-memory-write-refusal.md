# Memory tab: a refused delete or import keeps its question — and the reason — instead of closing

- **Date:** 2026-10-23
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-23-memory-write-refusal.zh.md)

Agent settings › Memory has two writes that ask first: deleting one memory, and importing a memory
export document back into a group. Both questions used to close themselves once the request came
back: when the server refused, the memory (and the files the import would have overwritten) were
still on the page and on disk, while the reason arrived as a toast that dismissed itself after six
seconds and sat above the modal — and the delete confirmation closed itself before the request even
left.

Both writes now close only once they landed. A refused delete keeps its confirmation open with the
server's words drawn under its sentence; an import reports in whichever layer asked — the plan
confirmation when one was shown, the "import memory" modal underneath it when nothing would have
been lost. The retry is the same button in every case.

## Details

- The rule is the one the model library, the plugin cards, the Skills / Hooks / MCP / Vault /
  schedules pages and the two bulk-update confirmations already follow (`ConfirmModal`'s `refusal`
  slot, 7.19 — 7.31): the reason is drawn in the card that asked for the write.
- `features/agents/memory-tab.tsx`: `confirmRemove` no longer calls `setRemoving(null)` first; a
  refusal hands the message to `deleteRefusal` and returns early, and the card closes, the list
  reloads and the agent card's count refreshes only on a written delete. The row's trash button, the
  drawer's and the phone sheet's all go through one `askRemove`, which opens the card and then drops
  the previous reason — that sentence belonged to the memory the last attempt named.
- `runImport` no longer raises its failure as a toast but hands it to `importRefusal`; the success
  path is unchanged. Where it is drawn depends on which layer asked: the plan confirmation
  (`ConfirmModal`) draws it in its own `refusal` slot, a direct import that needed no confirmation
  draws it in the import modal (same `S.common.refused` lead-in on both sides). Cancelling the plan
  comes back to the import modal with that sentence still on screen; picking a file again or
  switching modes clears it.
- New browser test `e2e/memory-write-refusal.spec.mjs` (three): a refused delete keeps the card, its
  sentence and the memory (no toast in the notification region; the card's text is unchanged apart
  from that one line), and cancelling changes nothing; the retry that lands closes the card and
  sends exactly that DELETE; a refused import keeps the plan confirmation with the reason inside,
  the group still holds what it held on disk and on the page, and only the permitted retry writes
  it. The seeded memory comes from the import route itself (the tab has no "new file" form by
  design), and both refusals come from `page.route`, so the page's contract with the server is what
  is checked.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* the surface closes and
  *where* the reason is drawn. No new copy beyond the existing `S.common.refused` prefix.
