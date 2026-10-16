# 极客主题的图表连线改为点间直线

- **Date:** 2026-10-16
- **Type:** fix
- **Scope:** `ui`

[English](2026-10-16-console-chart-lines.md)

移植自上游 PenguinHarness（#1131，提交 `bba0e3c9`）。

极客（Console）主题的图表此前把相邻数据点用**阶梯线**连起来：每个值先横向走半格、再竖着跳到下一个值，
于是读数看上去像在自己的格子里「保持」了一段。这个主题本来就给每个点画一个方块、给每根柱子描一条边
——值由柱子占住自己的格子来表达，线再说一遍就是同一句话写两遍。现在线直接从一点连到下一点
（`--ui-chart-curve: linear`），下方的填充跟着同一条线走；细线（1 px）、方块点（2 px）与柱子的几何
一概未动。通用（Primer）一直是直线、白领（Frost）是平滑曲线，这次只有极客变。

## 细节

- `packages/ui/src/themes/geek.css`：`--ui-chart-curve` 由 `step` 改为 `linear`，并把那段说明里的
  「stepped between points」一并改成「directly connecting points」。
- **只改主题里的取值，不动任何绘制代码**：`linear` 本来就是应用认识的值 —— `readChartStyle()` 只把
  `smooth` / `step` 挑出来，其余（含 `linear`）一律按直线画，`DEFAULT_CHART_STYLE` 用的也正是它。
- `packages/ui/test/token-contract.test.ts` 新增一条用例，钉住三个主题各自的连线方式（通用 / 极客
  直线、白领平滑）。上游这一笔没带用例，这条回归护栏是本 fork 加的。
