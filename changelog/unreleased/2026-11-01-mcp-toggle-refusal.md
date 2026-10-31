# A refused MCP Server switch says why under that row, not in a toast that expires

- **Date:** 2026-11-01
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-01-mcp-toggle-refusal.zh.md)

The Tools tab's MCP Server table has an on/off switch per row (`config.enabled`): off keeps the
entry and every field of it but stops the server connecting, which is how a plugin's bridge gets
parked without being deleted. That switch writes nothing optimistically — it sends the whole
`mcpServers` list through the one config PUT every edit here uses, and the rows keep the state the
server has until that write lands. So a **refused** flip left the table exactly as it was, with the
reason only in a toast that dismissed itself after six seconds: a switch that did not move and, six
seconds later, nothing at all saying why.

That sentence now stays under the row that asked, in a band of its own spanning the table's
columns: the shared lead-in `S.common.refused`, the danger ink, `role="alert"`, clamped to two lines
with the whole text on hover. It stays until the next flip (it is that attempt's answer, not the
row's standing state) or until any write in this block lands — the rows are identified by their
position in the list, and a landed write may have moved them. No new copy was written.

## Details

- `packages/web/src/features/agents/mcp-servers-toggle.ts` (new): `flippedEnabled()` — the list one
  flip produces, with the rule it already had (turning a server off stores `false`, turning it back
  on drops the key so the entry keeps following the default) — and `toggleRefusalFor()`, which row
  may draw the sentence. The row is identified by position, not by name: the Add/Edit modal refuses
  a duplicate name, but a hand-edited config may carry two entries of the same name, and a sentence
  keyed by name would be drawn twice.
- `packages/web/src/features/agents/mcp-servers-section.tsx`: a `toggleRefusal` state filled from
  the failed PUT (via `apiErrorText`) instead of `toastError`, cleared at the start of the next flip
  and by every write that lands; the sentence is drawn in a full-width row under its own. A
  successful flip still says so with its toast and still reloads the rows.

## Tests

- `packages/web/test/mcp-servers-toggle.test.ts` (new, 8 unit cases): a flip changes exactly one
  entry (and not the input list), off stores `false`, back on drops the key, an index that is no
  longer there changes nothing, and only the refused row's position draws the sentence — including
  the duplicated-name case that names cannot answer.
- `packages/web/e2e/mcp-toggle-refusal.spec.mjs` (new, two browser cases against the real server):
  a refused flip leaves the reason in the band under that row and nowhere else, the notification
  region without a dismissible toast, the switch and the server's list where the server has them,
  and the line still there seven seconds later; then, with the refusal lifted, the same switch
  lands — the line goes, the switch turns off, the neighbour's config is untouched, and flipping it
  back on sends the entry without an `enabled` key at all.

## Compatibility

- No API, on-disk or request-shape change: the PUT body is exactly the list this block built
  before. Only the failed path stopped using a toast.
