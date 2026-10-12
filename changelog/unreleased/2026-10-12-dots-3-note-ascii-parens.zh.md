# TokenDance 的 Dots3-Note Preview 改用半角括号命名

- **Date:** 2026-10-12
- **Type:** fix
- **Scope:** `core`

[English](2026-10-12-dots-3-note-ascii-parens.md)

移植自上游 PenguinHarness（#996，提交 `0e207146`）。

内置目录把 `dots-3-note-preview` 列为 **Dots3-Note Preview（Free）**：全角括号沿用自卖方的中文目录，
而目录里的模型名不随界面语言翻译，于是英文界面里也照样显示成一对贴着字的宽字形。用词仍按卖方的写法，
只改标点，与目录里其他带括号的名称一致（`Nemotron 3 Ultra (free)`、`Gemini 3.1 Pro (Preview)`）。

## 细节

- 没改过该行名称的 Project 立即显示新名称：预设模型的显示名从目录读取，从不写进 Project 配置。用户自己
  起过的名称存在配置里，不受影响。
- 接口、线上格式与已存数据都没有变化。
