# The Console theme's chart lines connect points straight

- **Date:** 2026-10-16
- **Type:** fix
- **Scope:** `ui`

[中文版](2026-10-16-console-chart-lines.zh.md)

Ported from upstream PenguinHarness (#1131, commit `bba0e3c9`).

The Console theme used to join adjacent readings with **stepped** lines: each value ran sideways half a
cell, then jumped vertically to the next one, so a reading looked like it held over a stretch of its
own. That theme already draws a square at every point and an outline on every bar — a bar standing
over its own cell is how a value holds — so the line said the same thing twice. The line now runs
straight from one point to the next (`--ui-chart-curve: linear`) and the fill follows the same line;
the 1 px stroke, the 2 px square points and the bars' geometry are untouched. Primer has always run
straight and Frost curves, so Console is the only theme that changed.

## Details

- `packages/ui/src/themes/geek.css`: `--ui-chart-curve` goes from `step` to `linear`, and the note
  above it now reads "directly connecting points" rather than "stepped between points".
- **Only the theme's value changed — no drawing code did**: `linear` is a value the app already
  knows. `readChartStyle()` singles out `smooth` / `step` and draws everything else (including
  `linear`) as straight segments, which is what `DEFAULT_CHART_STYLE` uses too.
- `packages/ui/test/token-contract.test.ts` gains a case pinning each theme's curve (Primer and
  Console straight, Frost smooth). Upstream's commit carries no test; the guard is this fork's.
