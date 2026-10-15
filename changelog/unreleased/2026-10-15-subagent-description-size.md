# Agents panel: a subagent's description sits a size below its name

- **Date:** 2026-10-15
- **Type:** fix
- **Scope:** `web`

[中文版](2026-10-15-subagent-description-size.zh.md)

Ported from upstream PenguinHarness (#1096, commit `6e54f6bc`).

In the agents panel's call graph, the second line of a child node — the description its spawning
`run_subagent` call carried — sat on the same rung as the agent's name above it, so a Chinese
description read as large as the name, or larger, and the node lost its who-then-what order. The
name now uses the body rung and the description keeps the small one beneath it, in all three
themes.

The graph's node boxes, gaps and edges follow the Font size setting as well: the canvas lays them
out in rem rather than in fixed pixels, so a node box grows with its two lines instead of squeezing
them. Before, Frost at XL clipped the bottom of the description. At the same font size a long
agent name truncates a little sooner; the node's tooltip still shows the full name and description.
