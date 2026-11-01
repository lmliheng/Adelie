# Deleting a large agent no longer freezes the app, and shows its progress

- **Date:** 2026-11-01
- **Type:** fix
- **Scope:** `server`, `web`, `ui`, `docs`
- **Breaking:** no

[中文](2026-11-01-agent-delete-background.zh.md)

Deleting an agent whose folder held many files — a temporary Workspace with installed dependencies
is the usual one — kept the server busy until the last file was gone. The Web App sat on the
confirmation dialog, and every other page that read a file waited behind the delete. Restarting the
app partway through left the agent on the Agents list, while opening or deleting it answered "This
agent no longer exists."

A delete now moves the agent's folder into `agents/.deleting/` in one rename, drops its index rows
and answers `202` with the deletion. From then on the agent is on no list, every route answers 404,
and its id can be used again. The folder's contents are removed in the background with only a
couple of filesystem calls in flight at a time, so the server keeps answering other requests.

Ported from PenguinHarness `#1348` (`4dca3c66`), not a branch merge: this tree has no workbench
mechanism and no machine-side Agents, so the two release-before-move calls for those are left out,
and so is the "still an employee" refusal, which belongs to a company-mode change this tree does
not have.

## Details

- `GET /api/projects/:projectId/agent-deletions/:deletionId` reports the removal: `counting`, then
  `removing` with `removed` out of `total` entries, then `done`, or `failed` with the operating
  system's reason.
- Whatever a removal leaves behind — an entry it could not remove, or the rest when the server
  stopped — is removed again at the next start under the same deletion id
  (`AgentLifecycle.resumeDeletions()`, called from `Startup.setup`).
- Before the move the server stops the agent's runs, as before. If the folder still cannot be moved
  because another program has a file in it open, the delete is refused with `409 agent_folder_busy`
  and nothing is deleted.
- The Agents list shows an agent only while its `agent_state/system_config.yaml` exists — the rule
  every agent route already applied — so a listed agent always opens and deletes, and one an
  interrupted delete left half-gone is no longer listed.
- When the removal takes noticeable time, a card in the bottom-right corner follows it: counting
  first, then items removed out of the total, then the result. Closing the card does not stop the
  removal, and the card stays on screen after you leave the Agents page. The card is
  `ProgressToasts` in the UI package, available to other long operations.
