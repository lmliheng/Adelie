# 引擎推进台账

> **第一版：** 2026-10-04
> **谁在读它：** 定时任务 `adelie-buildout` 每 4 小时醒一次，从本台账与 `docs/web-progress.md`
> 里取**一条**做掉（两边轮流，见下）。设计细节在每条指向的文档里，这里只记「做什么、怎么算
> 做完、做完了出现什么」。
> **一轮的固定动作**：与 `docs/web-progress.md` 同 —— 取一篇第一个未勾选的条目 → 实现 → 验证
> （`pnpm -r typecheck && pnpm -r test && pnpm -r build`，界面类另加 `node scripts/audit.mjs --with-e2e`）
> → 勾上并写一行结果 → commit + push（**不切版本、不发产物**）→ 用 `csu-mail` 发一句汇报到
> 0110230306@csu.edu.cn。卡点就停下并在邮件里写清。

## 条目

- [ ] **1. 用真模型验一次「计划文件」的落地** —— 2026-10-04 把运行时的计划状态机删了，改成
  提示词让模型把计划写进 `<会话目录>/PLAN.md`（工作区之外，`AgentRuntimeConfig.scratchpadDir`）。
  单测与端到端（假模型）都过了，但**真模型会不会真的写、写得进去吗**还没验过。
  做法：在 `/root/adelie-workspace` 发**一条小任务**（例如「给 README 加一行安装说明，然后跑一遍
  测试」；要长到值得写计划，但别跑长任务，花了钱记一笔）。用 CLI（key 在 `~/.adelie/.env`）
  或 4000 上的 Web 都行。看四件事：① 会话目录里出现 `PLAN.md`；② 工作区里**没有** PLAN.md；
  ③ 时间线里没有计划卡/验收卡；④ 任务结束时模型有没有把计划更新到最新。结论写回来。
  **卡住（2026-10-04 查证）：本机没有任何模型 key** —— `~/.adelie/.env` 不存在，
  `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `MOONSHOT_API_KEY` / `DASHSCOPE_API_KEY` 四个环境变量
  都是空，`/etc/adelie/web.env` 只有 `ADELIE_TOKEN`，本机也没装 ollama。`~/.adelie/sessions/`
  里那两个会话是 e2e 的假模型跑在 `/tmp` 里的。**要用户把 key 放进 vault**（`penguin config vault
  set … DEEPSEEK_API_KEY`，新对话才注入）或者临时 `export DEEPSEEK_API_KEY=…` 再跑这一轮。
  没 key 就别硬跑 —— 401 只会在花了钱之后才告诉你。
- [ ] **2. 提示词守则与 penguin 逐条对照** —— 用户的要求是「学习 penguin 的模式」。penguin 的默认
  提示词（`/root/penguin-harness/packages/core/src/state/default-config.ts` 的 `# Success criteria` /
  `# Constraints` / `# Stop rules` 几段，只读）里有几条 Adelie 的 `buildSystemPrompt()`
  （`packages/runtime/src/agent.runtime.ts`）还没有：命令一律非交互跑、搜索只从 CWD 往下、
  路径解析不了先缩小范围而不是扩大、名字没见过的先去查、独立调用要在同一轮里一起发出去。
  **一次只搬一条**，搬完写清「搬的是哪条、为什么值得、测试里怎么体现」。不要一次全搬。
  **进度（2026-10-04）：已搬「命令非交互地跑」**（见「已完成的轮次」）。还剩：搜索只从 CWD 往下、
  路径解析不了先缩小范围、名字没见过的先去查；「独立调用同轮发出」Adelie 已有弱版（`batch` 工具）。
- [x] **3. 跨版本事件的读法再确认** —— 重放会跳过认不得的事件类型，界面渲染成一行
  「未识别的事件类型：X（这份历史来自另一个版本）」（2026-10-04 已改）。CLI 的 `/session export`
  与服务端的 `GET /api/sessions/:id/markdown` **共用**同一个渲染器（`renderSessionMarkdown`），
  未知类型在摘要里点出条数与类型、正文里给一段 JSON 兜底；`docs/` 与各 README 里**没有**把
  `plan_updated` / `verification` 当现行机制描述的段落（只有本台账自己在说它们已删）。**已确认，没改代码**，
  证据见「已完成的轮次 · 2」。

> 条目 2 与 3 谁先谁后都行；条目 1 优先 —— 它是这一轮改动的直接验收（现在卡在 key 上）。

## 已完成的轮次

- **2026-10-04 · 2** —— 条目 3（跨版本事件的读法）**确认，没改代码**：CLI 的 `/session export` 与
  服务端的 `GET /api/sessions/:id/markdown` 走的是同一个 `renderSessionMarkdown`
  （`packages/core/src/persistence/session-export.ts`），它对认不得的类型有两层处理 ——
  摘要里点出「未知事件类型：N 条（plan_updated、verification）」，正文里逐条给一段 JSON 兜底，
  不静默丢也不崩。在 4000 的真部署上拿一份含旧事件的会话导出看过（11 条事件里 3 条是旧机制留下的），
  输出与预期一致。文档侧 grep 过 `docs/` 与各 README：只有「验收 = 验收标准」这种同字不同义的用法，
  以及本台账自己在说它们已删 —— 没有段落把它俩当现行机制描述。

  **同一轮顺带修掉一个真实报错**（发现路径就是上面那次导出：那份旧会话里有一条
  `401 … "Your api key: ****ined is invalid"`）——**没配密钥时服务端照样发请求**，
  `Authorization: Bearer ${undefined}` 把「密钥缺失」变成了「密钥错误」：那句话既不说是哪个变量缺，
  也不说去哪配。现在真端点这条路在**发请求之前**就拦下来，理由是「没有可用的密钥：请先设置
  `DEEPSEEK_API_KEY`……」（`packages/server/src/settings.ts` 的 `missingApiKeyMessage`，
  接线在默认 provider 工厂里）。自定义端点（`baseUrl` 非空）**不拦** —— 本机 mock 与兼容网关
  自己决定要不要密钥，端到端冒烟走的正是那条路。
  验证：服务端 `typecheck` 通过、测试 55 → 59（四种情形：缺密钥 / 有密钥 / 自定义端点 / 每家变量名），
  4000 真部署上发一条消息拿到的是那句人话（见提交里的记录）。
- **2026-10-04 · 1** —— 提示词守则逐条对照的第一条：把 penguin `# Tool use` 里的
  「Run commands non-interactively（`-y`/`--yes`、no editors/pagers/REPLs）」搬进
  `buildSystemPrompt()` —— 值得搬的理由是它的失败方式最隐蔽：命令等输入时**不报错、只是挂着**，
  一路拖到 `timeoutMs`（默认 5 分钟）才算结束，事后从事件流里也看不出是「等输入」。
  测试钉在新建的 `packages/runtime/test/system-prompt.test.ts`（同文件还钉住「PLAN.md 与
  『用项目自己的命令验证』两条仍在」，因为计划与验收改成提示词约定之后，提示词是它们唯一的家）。
  验证：`pnpm --filter adelie-runtime typecheck / test` 通过（126 通过 / 7 跳过，此前 124）。
  条目 2 仍是未勾选：这一轮只搬了一条。
- **2026-10-04 · 0** —— 建台账。同一天已完成的引擎改动记在 `CHANGELOG.md` 的
  「未发布 — 计划与验收不再由运行时代管（改学 penguin）」里：删掉运行时的计划状态机与验收子系统，
  计划改成模型自己维护的 `PLAN.md`（会话目录里），验收改成「跑项目自己的命令」。
  残留：真模型没验过（条目 1）；提示词只搬了 penguin 的「三次修法」与「自己跑命令验证」两条。

## 决定

- **界面不加计划、也不加验收（用户 2026-10-04 原话「界面不用加计划和验收」）** —— 所以不补只读的
  `PLAN.md` 面板，也不恢复任何计划/验收事件。界面保持现状：只有工具调用、观察与最终答复。
  这一问是条目 1 之外唯一悬着的事，已结。
