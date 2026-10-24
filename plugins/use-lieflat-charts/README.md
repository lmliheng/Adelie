# use-lieflat-charts

把数据变成精致、可交互的 HTML 图表，必要时再变成可翻页的 HTML/PDF 演示或整页报告。装进 Agent 后，
它会以 `lieflat-charts` 技能出现。

- **默认产出图表**：只给数据、说「可视化一下」都走图表模式；只有用户明确要「一套 PPT / 幻灯片」或
  「报告 / 年报 / 白皮书 / 海报 / brief」时才进入演示或报告模式。
- **模板驱动**：每张成品图都必须从 `templates/` 里的真实模板实现出发（Lupi 编辑型、Basics 基础型、
  Glance 快读型、Maps 地图、交互大图），沿用其几何结构、编码方式与入场动效，不许另画「看起来差不多」的图。
- **一套色系**：默认 Mono 灰阶；按数据语义可在青瓷蓝、椰林绿、编辑部红三套内置预设间自动选择，
  用户给出品牌色时建一套 custom 色板。同一份交付只锁一种色系。

## 装法

在桌面端的插件库里找到 **Lieflat Charts**（`use-lieflat-charts`）点安装到目标 Agent。命令行两条路：

```bash
# 建 Agent 时就带上（插件库插件名，逗号分隔）
penguin agent create --agent-id my-agent --plugins use-lieflat-charts

# 装到已有的 Agent（Project 成员即可操作）
curl -X POST "$SERVER/api/projects/$PROJECT_ID/agents/$AGENT_ID/plugins" \
  -H 'content-type: application/json' -d '{"names":["use-lieflat-charts"]}'
```

它默认不随 Agent 初始化一起装（`preinstall: false`）：技能内容约 2.5 MB 的模板，装到需要画图的
Agent 上就行。

## 许可与出处

移植自 [larashero3-dotcom/lieflat-charts](https://github.com/larashero3-dotcom/lieflat-charts)（作者「躺在废墟里」），
上游许可是 **PolyForm Noncommercial License 1.0.0** —— 非商业用途可自由使用、修改、再分发；
**商业用途需要另行取得原作者授权**。原文见 [LICENSE](LICENSE)，移植范围与改动见 [NOTICE.md](NOTICE.md)。

上游要求：用它生成的成品公开发布时，请署名或 @ 原作者（技能正文里也带着这条提示）。
