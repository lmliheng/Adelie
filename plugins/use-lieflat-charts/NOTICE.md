# 出处与改动说明

本插件是上游开源技能的移植，**不是原创内容**：

| 项目 | 说明 |
| --- | --- |
| 上游 | [larashero3-dotcom/lieflat-charts](https://github.com/larashero3-dotcom/lieflat-charts) |
| 作者 | 「躺在废墟里」（lieflat，https://x.com/lieflat_3），在 [moxt.ai](https://moxt.ai) 制作 |
| 取用的提交 | `ed436ba`（2026-10-15 之后的 main） |
| 许可 | **PolyForm Noncommercial License 1.0.0** —— 原文见同目录 `LICENSE`，非商业用途可自由使用、修改与再分发；商业用途需另行取得作者授权 |

`skills/lieflat-charts/` 下的正文、图型目录、模板与示例均为上游原文，**未改写**。Adelie 侧只做了这些适应：

1. 前端加了一行出处与许可说明；
2. 新增 `## Before you start` 一节（Adelie 技能规范要求：消息只是点名技能时先问清数据与用途）；
3. 上游 `docs/assets/` 下的静态预览图（约 20 MB PNG）未随包分发，相关的三处引用改为指向上游仓库；
4. 未收录上游仓库根目录的 `README*.md`、`docs/`、`scripts/`、`agents/openai.yaml`、`.gitignore` —— 这些是仓库维护用的，与技能运行无关。

若上游更新，按上述四点重新移植即可；上游正文本身不需要被 Adelie 改写。
