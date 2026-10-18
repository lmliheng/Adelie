# Switching Projects no longer shows, or asks about, the previous Project's Agents

- **Date:** 2026-10-18
- **Type:** fix
- **Scope:** `web`

[中文版](2026-10-18-project-switch-isolation.zh.md)

Port of upstream PenguinHarness #1165 (commit `61cd00bb`), adapted to this tree. Switching Projects
in the Web App could show the Agents of the Project just left — the Agents page listed them under
the new Project and opened their settings — and send requests that paired the new Project with an
Agent it does not have, which answered 「该 Agent 已不存在。」 / "This agent no longer exists." A
conversation open at the switch stayed on screen under the new Project. All of it happened more
often on a slow machine, where lists answer out of order and renders lag behind the network.

## Details

- Every Project-scoped answer now carries the Project it was asked for and is applied only while
  that Project is still current, and state held for a Project is published only under that Project
  (`lib/project-scope.ts`). This covers the Project's Agent list, the Session list (its reloads,
  its next pages and the rows handed to it), the machines' Agents the list asks about, the
  organizations' desk and ticket Sessions, the Agents page's machine Agents and the chat page's
  model configuration.
- A Project that disappears from a refreshed Project list is left the way a switch leaves it: the
  Project the app falls back to never shows the old Agents.
- The conversation the route names is shown only under its own Project, whether it came from the
  list, from a direct lookup or was held through a refetch; after a switch the page opens the new
  Project's latest conversation or a new chat.
- An Agent's settings page leaves for the new Project's Agents list on a Project switch instead of
  asking the new Project about that Agent. A late config answer for another Agent is no longer
  shown on the page.
- An Agent's memory listing is keyed by its Project too, so the `default_agent` of one Project no
  longer stands in for another's.
- The cost center's Agent filter belongs to the Project it was chosen in — the `?agentId=` deep
  link to the Project the page was opened in — so after a switch the page reads the new Project
  unfiltered. A usage answer for the Project just left, or for filters changed since, is dropped.
- A Benchmark's page leaves for the new Project's Benchmarks list on a Project switch instead of
  asking the new Project about that Benchmark.
- The sidebar swaps its per-Project groups, pins and registered Workspaces in the render that sees
  the switch instead of in an effect one commit later.
