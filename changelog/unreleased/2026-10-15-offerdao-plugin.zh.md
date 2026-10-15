# 新增插件：Offer岛求职与 AI 行业情报

- **Date:** 2026-10-15
- **Type:** feat
- **Scope:** `plugins`

[English](2026-10-15-offerdao-plugin.md)

新插件：**Offer岛**（`@lmliheng/use-offerdao`），移植自 Offer岛官方的 skill 仓库
（[`offerdaoai/skills`](https://github.com/offerdaoai/skills)，MIT，提交 `45c2a5d8`）。

在插件库页面上把它装到想用的那个 Agent（它不是预装插件）。它接的是 `https://offerdao.ai` 的开放接口：

- **搜索与发布（需要个人 key）**：按公司 / 岗位 / 地点 / 工作类型 / 时间筛已审核的岗位；或者把一段
  JD——粘贴的原文或一个链接——交给它，解析成结构化岗位提交给平台审核。用谁的个人 key 发布，岗位就归属到谁，
  而且 `/j/<id>` 短链要等管理员审核通过才打得开。
- **不需要 key**：AI 公司目录、精选面经攻略、每日 AI 资讯（`/news/md/<YYYYMMDD>.md` 与一份 JSON feed），
  装完立刻可用。

key 的取法是先看 `OFFERDAO_API_KEY`（Agent 密钥库），再看本机 `~/.offerdao/config.json`（用户装了
Offer岛自己的 daemon 才有），最后才请用户提供；发布一律用自己的个人 key，共用的测试 key 只能读。

移植时按 Adelie 的规矩改了四处：补了 `Before you start` 一节（每个随库分发的 skill 都有）、把
`browser-act` 换成本仓库的 `browser-automation`（`penguin browser`）来渲染链接页面、去掉站内卡片块与
daemon 自动更新那套约定、把密钥存进 Agent 密钥库的说法写进去。上游的 MIT 许可证随 skill 一起放在
`skills/offerdao/LICENSE`；`references/`（发布字段、公司对象、资讯格式）原样搬来。
