# Penguin Web 功能面清单：模型 / 运维（只读研究）

> **研究日期：** 2026-10-04
> **依据版本：** `package.json` version `0.2.13`（`packages/web/package.json` 同为 `0.2.13`）；
> 判据是 `packages/web/src/features/` 下这 10 个目录的实际源码，以及它们调用的服务端路由与表。
> **读了什么（都能按 `文件:行` 复核）：**
> - 骨架：`packages/web/src/router.tsx`、`app.tsx`、`module.json`、`lib/pages.ts`、`api/endpoints.ts`（只读目标接口段落）、`state/auth|project|sessions`（只读导出）
> - `features/models/*`（头部注释 + 导出清单 + 辅助模块全文：`balance.ts`、`catalog-sync.ts`、`model-tags.ts`、`speed-test.ts`、`model-grouping.ts`、`model-group-order.ts`、`protocol-types.ts`；`models-page.tsx` 只读头部与组件骨架，未逐行）
> - `features/usage/*` 全部（`usage-page.tsx`、`usage-controls.ts`、`usage-charts.tsx` 头部、`trend-chart.tsx`、`errors-panel.tsx` 头部）
> - `features/traces/*` 全部（三个纯函数模块全文、三个组件的头部与结构）
> - `features/agents/*`、`features/skills/*`、`features/plugins/*`、`features/schedules/*`、`features/benchmark/*`、`features/ai-create/*`、`features/harness/*`：每个文件的头部注释 + 主要导出（未逐行读大文件）
> - 服务端：`http/routes/{models,usage,agent-traces,sessions,agents,agent-config,agent-transfer,skills,hooks,memory,vault,schedules,benchmarks,plugins,plugins-installed,directory-skills,platform-auth,modelscope-auth,model-oauth,version}.ts` 的头部与路由表，
>   `services/{usage-service,trace-service,trace-index,benchmark-service}.ts` 的头部与方法表，`db/schema.ts` 的表定义，`mechanisms/{observability,traces}.ts` 全文，`runtime/{usage-recorder,scheduler,schedule-store}.ts` 头部
> - Adelie 侧：`docs/api.md`、`docs/redesign.md`、`packages/server/src/routes/*`（路由表）、`packages/web/src/{App.tsx,components/SettingsDialog.tsx,components/TurnView.tsx,api/types.ts,package.json}`、`packages/core/src/config/model-catalog.ts`
>
> **说明：** 本文写的是 **Web 界面 + 它背后的 HTTP/DB 契约**，不含桌面壳（那一份见 `penguin-desktop-features.md`）。
> 服务端的模型/用量/trace 数据模型另有更细的一篇 `penguin-models-usage-trace.md`；本文不重复它的推导，只补「Web 面由哪些组件/状态/路由组成」。
> 我没有启动 Penguin 的服务，**所有结论都来自源码阅读**；凡是我没读到的地方都标了「未核实」。

## 0. 先摸信息架构：一个页面是怎么被装进来的

| 事实 | 源码位置 | 说明 |
| --- | --- | --- |
| 页面登记在清单里，不在路由表里 | `module.json:6`（`contributes.web.pages`）→ `lib/pages.ts:24`（`PAGES`） | 一个页面 = 一条 JSON：`key` / `path` / `nav` / `admin` / `released` / `renderer` |
| 路由是 `PAGES.map` 生成的 | `router.tsx:135` | 除 `/login`、`/terminal`、`/app/…`（工作流独占整页）外，全部裹在 `RequireAuth`（`router.tsx:130`）里 |
| 渲染器是一张写死的注册表 | `router.tsx:45` `BUILTIN_PAGES`、`router.tsx:58` `renderPage` | 服务端也能贡献页面（`GET /api/contributions`），但渲染器不在表里就跳过（`lib/pages.ts:40`） |
| 侧栏导航 = 清单里 `nav:"main"` 的条目 | `lib/pages.ts:32` `navPagesFor` | `admin:true` 的页面（machines）对非管理员隐藏；服务端另有 403 兜底（`router.tsx:132`） |
| 全局 provider 栈 | `app.tsx:46` | Clipboard → CodeHighlighter → Locale → Theme → Auth → LocaleScope → Router；`state/` 下是 auth / project / sessions / company / theme / locale |
| 所有 HTTP 调用集中在一处 | `api/endpoints.ts`（2403 行） | 前端不认识 URL 字符串以外的服务端实现，接口形状全部从 `@prismshadow/penguin-server/api` 的类型来 |

**这 10 个面映射到的页面与路由前缀：**

| 面 | 页面（`module.json`） | 路由 | 服务端前缀 |
| --- | --- | --- | --- |
| models | `web.models` | `/models` | `/api/projects/:p/models*` |
| usage | `web.usage` | `/usage` | `/api/projects/:p/usage*` |
| traces | *没有页面*（会话内 dock 面板 + Agent 级 HTTP） | — | `/api/sessions/:id/traces*`、`/api/projects/:p/agents/:a/traces*` |
| agents | `web.agents` / `web.agent-settings` | `/agents`、`/agents/:agentId` | `/api/projects/:p/agents*` |
| skills | *没有独立页*（选择面板 + Agent 设置 tab + 插件库） | — | `/api/projects/:p/agents/:a/skills*`、`/api/projects/:p/dir-skills` |
| plugins | `web.plugins` / `web.plugin-detail` | `/plugins`、`/plugins/registry/*` | `/api/plugins*`、`/api/projects/:p/plugins*` |
| schedules | *没有独立页*（Agent 设置 tab + 对话 dock 面板） | — | `/api/projects/:p/agents/:a/schedules*`、`/api/projects/:p/schedules` |
| benchmark | `web.benchmark` / `web.benchmark-detail` | `/benchmark`、`/benchmark/:id` | `/api/projects/:p/benchmarks*` |
| ai-create | *没有页面*（面板/弹窗，被别的面引用） | — | 无（复用普通会话 + 草稿） |
| harness | *没有页面*（命令面板里的覆盖层） | — | `/api/version*` |

---

## 1. models —— 模型库与密钥管理

页面 `features/models/models-page.tsx:750`（4065 行，本面最大的文件）。

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 模型表读写 | 一张模型表，整体替换语义（没出现的行即删除；空 apiKey = 保留原值） | `http/routes/models.ts:216`（GET）、`:223`（PUT）；page 头部注释 `models-page.tsx:45-48` | 无 | 中 |
| 唯一键是 `(provider, modelId)` 配对 | 全程不做 `provider/model` 字符串拼接，上游 id 原样透传 | `models-page.tsx:1-6`；`model-grouping.ts:1-15` | 无 | 低 |
| 分组列表 + 折叠 + 拖拽排序 | 按厂商分组（logo + 名称 + 计数 + 折叠箭头），组顺序可拖，存在 Project 级 localStorage | `models-page.tsx` 头部；`model-group-order.ts:1-30`；`model-group-expansion.ts` | 无 | 中 |
| 卡片与标记 | 卡片只放显示名 + 状态徽标（default / vision / fast / free / discount），上下文/价格/密钥状态折成一行小字 | `model-tags.ts:1-18`；`models-page.tsx:2211` `ModelCard` | 无 | 低 |
| 配置弹窗 | 改密钥、上下文窗口、三档价格、vision 开关；设为默认 / 设为视觉模型 / 删除 | `models-page.tsx:2443` `ModelDialog`、`:2211` `ModelCard` | 无 | 中 |
| 改身份 = 改名 | 改组或改上游 id 是一条 **rename**，用配对 `renamedFrom` 提交，服务端迁移凭证与指针 | `models-page.tsx:1-6`；`:412` `nextPointers` | 无 | 中 |
| 连通性 / 速度测试 | 组头的测速按钮，逐模型出 TTFT 与 TPS，卡片上绿黄红三档着色 | `http/routes/models.ts:276`；`speed-test.ts:1-12`（阈值）、`models-page.tsx:249` `TONE_CLASS` | 真实往上游发一次请求 | 中 |
| 协议探测与选择 | custom / 用户定义组可选或探测协议（openai-responses / ant-messages / openai-chat） | `protocol-types.ts:1-30`、`protocol-path.ts:41`、`protocol-suffix.tsx`；服务端 `models.ts:328` | AgentHub 的协议客户端 | 高 |
| 上游模型清单 | 「列出可用模型」从端点拉 `/models` 再逐条清洗成合法 id | `models.ts:359`；`group-import.ts:77`；id 规则见 `models-page.tsx` 头部与 `MAX_MODEL_ID_LENGTH` | 上游端点的 `/models` | 中 |
| vision 探测 | 一键盘点某模型是否支持图片 | `models.ts:380` | 真实请求 | 中 |
| 组余额（读 + 固定） | 组头显示余额（可刷新），可「钉」到侧栏用户名旁；同一 store 两处共享，服务端 60 s 缓存、`force` 跳过 | `models.ts:236`；`balance.ts:102` `requestBalance`、`:130` `useBalance`、`:139` `PINNED_BALANCE_PREFS_KEY`、`:181` `usePinnedBalance`；`group-balance.tsx:35`（5 分钟重读）；`lib/../user-menu` | 各家厂商的余额接口（服务端适配） | 高 |
| 一键同步内置目录 | 搜索框旁的「同步预设」：union 合并 —— 目录事实（上下文、三档价、协议钉、vision、促销）覆盖本地，部署字段（baseURL、密钥、输出上限、fast）绝不动，凭证不动 | `catalog-sync.ts:1-40`、`:252` `catalogDelta`、`:301` `syncRowsWithCatalog` | 客户端内置目录（`core/model-catalog`） | 中 |
| 密钥授权（设备式 / OAuth） | 「授权一个 key」弹窗：起流 → 轮询 → 重试 / 取消；完成只回报「应用了几条预设」 | `key-auth-dialog.tsx:1-30`（`POLL_MS=3000`）；服务端 `platform-auth.ts:43/55/67/80/93`、`modelscope-auth.ts:46/58/71/84`、`model-oauth.ts:166/215/245/275` | 外部授权桥 / 厂商 OAuth；桌面模式下改走系统浏览器（`key-auth-dialog.tsx:59`） | 高 |
| 加组 / 加模型 | 「加组」「加模型」复用同一个配置弹窗，按组语义决定协议 | `models-page.tsx:1913` `AddGroupDialog`、`:3757` `GroupKeyDialog`、`:3860` `ModelOAuthDialog` | 无 | 中 |
| 用量徽标 | 模型导航项上的点：由 `catalogDelta` 算出「有预设可同步」，保证点过去一定有活干 | `lib/use-project-todos.ts:1-30`、`lib/use-update-badges.ts:1-20` | 无 | 中 |
| 权限 | 任何成员可读（api_key 遮罩）、可读余额；只有 owner 能改 / 测 / 探 | `models.ts:1-5`（头注） | 无 | 低 |

**Adelie 现状**（对着 `docs/api.md` 与 `packages/web/src` 核过）

- **有**：`GET /api/models`（`packages/server/src/routes/config.ts:172`）= 四家目录（`core/src/config/model-catalog.ts:44` `MODEL_CATALOG`，含 `envKey` / `baseUrl` / `clientType` / `models[]`）；
  `GET|PATCH /api/config`（`config.ts:65/67`）写 `apiKey`（0600，分身份存，任何响应不出现密钥值）；
  Web 侧 `SettingsDialog.tsx:1-6` 从 `/api/models` 渲染提供方下拉 + 模型 `datalist`（P2 验收表见 `docs/redesign.md:230-244`）。
- **没有**（与 Penguin 的差距，按性价比排序）：① 模型是一份 per-identity 的 `{provider, model}` 引用 + 一个 key，**没有「一个 Project 一张模型表」**，因此没有多条同厂商模型、没有默认模型指针、没有改名迁移；
  ② 没有价格字段，所以连「模型卡上的价格」都没有；③ 没有余额、速度测试、协议探测、vision 探测、授权流；
  ④ 没有模型页（只有设置弹窗里的两个控件），也就没有分组 / 折叠 / 拖拽 / 标记 / 搜索这些「找模型」的部分。
- **可以做但没必要先做**：Penguin 的其余八个能力都建立在「模型表落 Project」之上，Adelie 若只想要「密钥可管」，现状已经够用。

---

## 2. usage —— 用量与成本

页面 `features/usage/usage-page.tsx:151`，是 Adelie 路线上 P4 的对照物。

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 三个过滤器 | Agent 下拉（可由 `?agentId=` 深链，URL 是唯一真源）、Model 下拉（**配对引用**，选项值用候选下标而不是拼字符串）、日期范围（1h/1d/7d/30d/90d/自定义） | `usage-page.tsx:165-186`、`:291-373` | 无 | 中 |
| 精度不单独控制 | 范围决定粒度：1h→minute、1d→hour、其余按天数 day/week/month；服务端每响应最多 500 桶 | `usage-controls.ts:71` `defaultGranularity`、`:88` `presetDefaultGranularity` | 无 | 低 |
| 三张汇总卡 | 今天 / 近 7 天 / 累计，各卡三行：token、请求数、成本（有未定价记录时成本名旁带上标星） | `usage-page.tsx:92` `SummaryCard`、`:396-398`；`:476` 未定价脚注 | 无 | 低 |
| 四张图（2×2） | 请求数+成功率（按 Agent / 按 Model，堆叠柱 + 右轴 0–100% 折线）、token 分桶（堆叠 + 虚线缓存命中率）、成本（线 + 点 + 面积） | `usage-charts.tsx:192` `RequestsChart`、`:422` `TokenBarChart`、`:588` `TokenLegend`；`trend-chart.tsx:46` `TrendChart` | `@prismshadow/penguin-ui` 的 `ChartFrame/ChartBar/ChartLine/ChartPoint`（**不是手写 SVG**） | 高 |
| 空桶压缩 + 轴断点 | 四张图共用一次压缩，被跳过的区间在轴上标出断点，避免「什么都没发生」的地段摊平形状 | `usage-controls.ts:228` `compactSeries`、`:258` `compactCounts`、`:198-247` 注释 | 无 | 中 |
| 系列头尾折叠 | 超过调色板长度（`MAX_NAMED_SERIES`）的实体折成一条中性灰「其他 N 个」 | `usage-controls.ts:126`、`:135` `foldEntitySeries`、`:149` `sumCounts` | 无 | 中 |
| 成功率 / 命中率的空口径 | 分母为 0 时是 `null`（气泡里显示破折号），画线时补到轴顶 —— 图的连续性不冒充「失败的 100%」 | `usage-controls.ts:167` `rateSeries`、`:191` `NO_RATE_PLOT`、`:194` `plotRates` | 无 | 中 |
| 错误面板 | 一栏统计（总数 / unexpected / expected / 最常见错误码）+ 最近错误表（时间、来源·错误码、kind、消息、折叠计数）+ 分页 | `errors-panel.tsx:148` `ErrorsPanel`、`:53` `errorsClearScopeText`、`:76` `clearableFilter` | 无 | 中 |
| 清空错误表 | owner 才有的动作，且「屏幕上是哪一段就删哪一段」：`from`/`to` 必填，不接受 `kind` | `errors-panel.tsx` 头部；服务端 `usage.ts:192` | 无 | 低 |
| 徽标探针 | 意外的错误用 `limit:1` 的行问一次（`total` 是计数、`items[0]` 是最新一条，用来记「已读」）；窗口取成本中心自己的默认 7 天 | `lib/use-project-todos.ts:1-35`；`lib/todo-dismissals.ts` | 无 | 中 |
| 服务端查询 | `GET /api/projects/:p/usage?from&to&fromTs&toTs&groupBy&granularity&agentId&provider&modelId&utcOffsetMinutes`：groupBy 四选、granularity 五选、`fromTs/toTs` **成对**、`utcOffsetMinutes` 限 ±14h | `usage.ts:36/38/63/79/94` | 无 | 中 |
| 每模型终身用量 | `GET …/usage/model-totals`：不带任何过滤，给模型卡显示「这个模型一共花了多少」 | `usage.ts:138`；`endpoints.ts:1244` | 无 | 低 |
| 错误记录从哪来 | 服务端各处统一往 `error_records` 落一条（http / session / usage / title / subagent / process / llm / environment / compaction / schedule / messaging），`kind` 只有 expected/unexpected，**不存堆栈** | `db/schema.ts:116-128`；`runtime/error-recorder.ts`、`stream-error-watcher.ts` | 无 | 中 |
| 无归属错误只有管理员可见 | 登录失败、进程崩溃这类没有 Project 上下文的行，普通成员读写都看不到（跨租户泄漏防线） | `usage.ts:120-124`、`:173-175`、`:210-214` | 无 | 低 |
| 权限 | 读面板 = 是本 Project 成员；清空 = owner | `usage.ts:196-197` | 无 | 低 |

**Adelie 现状**

- **有**：每轮 SSE 的 `run_finished` 带 `usage: {promptTokens, completionTokens, totalTokens}`（`docs/api.md:197`）；Web 在 `TurnView.tsx:49` 取 `turn.finished?.usage ?? view.summary?.usage` 显示在这一轮上；类型 `TokenUsageLike` 在 `packages/web/src/api/types.ts:153`。
- **没有**：`GET /api/usage`（服务端路由只有 auth / chat / config / sessions / users 五组，见 `packages/server/src/routes/`）、价格表、任何聚合、任何时间序列、错误表、徽标。
- 与 `docs/redesign.md:118-134`（§5）与 `:194`（P4 行）一致：**P4 未开始**。
- Adelie 有一个 Penguin 没有的便宜入口：事件流已经是全量可读的（`GET /api/sessions/:id` 回 `runs` + `events`），所以「先读事件流现算」这条路在 Adelie 比在 Penguin 更短 —— Adelie 自己的 redesign 也这么写了（`:134`）。

---

## 3. traces —— 一次运行的 trace（查看 / 分析 / 下载）

Penguin 的 trace 是「**一个文件 = 一段完整的模型上下文**」，压缩或换模型时 rotate 出新编号分片。
Web 侧读它的地方只有一个：聊天页 dock 里的 Trace 面板（横跨全 Session 的浏览页已被删掉）。

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 分片文件命名 | `<sessionId>_<NNN>.jsonl`，编号即上下文段号 | `services/trace-service.ts:84` `TRACE_FILE_RE` | 无 | 低 |
| 会话内分片列表 | dock 面板顶部的分片 pill 行，最新在前，超过 6 个折叠；显示日期与体积 | `trace-panel.tsx:38` `FILE_PILL_CAP`、`:47` `TracePanel`；`sessions.ts:1495` | 无 | 中 |
| 刷新规则（纯函数） | 「可见边」与「结算轮次边」两条边才重取；隐藏时不取、不排队，重新显示时自然补上；选中的分片在重列后仍站得住 | `trace-refresh.ts:36/52/67/83`（单测 `test/trace-refresh.test.ts`） | 无 | 中 |
| 下载分片 | 工具栏的导出链接直接指向带 `Content-Disposition: attachment` 的 URL | `endpoints.ts:1155` `agentTraceDownloadUrl`；`agent-traces.ts:110` | 无 | 低 |
| 导入外部分片 | Agent 级 `POST …/traces/import`（owner only）：文件用自身的 `session_meta` 报名，永远落到**新 Session 的 001**；session id 已存在则 409 | `agent-traces.ts:130`；入口在系统设置 —— `features/settings/general-section.tsx:30`、`trace-import-row.tsx:62` | 上传 / 下载 | 中 |
| 按 Task 分组的文件视图 | 顶部全局摘要；下面每轮一张卡：该轮统计 + 上下文**甜甜圈环**（上限=会话上下文窗口，三段 = cacheRead / cacheWrite / output），再下是该轮时间线与全部消息 | `trace-file-view.tsx:206` `TraceFileView`、`:76` `compactionBadgeLabel`；头部注释 `:1-30` | 无 | 高 |
| 逐轮 token 拆分 | 输入（括号里是其中命中缓存的部分）、输出、工具调用数、成本、耗时、输出 TPS | `trace-file-view.tsx:1-30`；数字全部来自服务端 analysis | 无 | 中 |
| CUDA-profiler 式时间线 | 五种 bar（thinking / 模型回复 / 工具调用生成 / 审批等待 / 工具执行），每 Task 一条独立时间轴，同名工具不重叠共行、重叠拆行；拖动滑块缩放/平移，不支持滚轮缩放 | `timeline-chart.tsx:331` + 头部 `:1-30`；`lane-packing.ts:28` `toolSpanBounds`、`:50` `packToolLanes` | 无 | 高 |
| 时间线 ↔ 消息联动高亮 | 悬停一侧高亮另一侧（只有一根 bar / 一行消息亮，按唯一 key 而不是时间戳），点 bar 滚到对应消息并钉住高亮 | `timeline-chart.tsx:46-62` `TraceHighlight`；`trace-file-view.tsx:1-30` | 无 | 中 |
| 事件行 | 每行一条原始消息：类型徽章、一句话摘要、可展开 | `trace-event-row.tsx:31` `typeBadge`、`:82` `summarizeEvent`、`:410` `EventRow` | 无 | 中 |
| 事件分页加载 | 顺序翻页（页大小 1000 = 接口上限），边翻边渲染，最长 500 页；被追加的文件跟着长 | `trace-events-loader.ts:23/29/69`（单测同名） | 无 | 中 |
| 服务端分析 | 分析一次 derive 全给：`request_begin/end` 最近邻配对、工具调用耗时配对、重连与压缩计数、token 趋势、每轮的 `messageFrom/To` 区间 | `trace-service.ts:916` `analyze`；头部 `:1-12`；返回类型 `TraceModelSegment/TraceToolSpan/TraceOtherSpan/TraceTaskStats`（`api/types.ts`） | 无 | 高 |
| Agent 级列表 | `GET /api/projects/:p/agents/:a/traces`：带 `offset/limit/category` 时按 Session 分页（最新在前），不带时是旧的「Agent→日期→Session→分片」全量树；每 Session 的标题、分类、Workspace 一并给 | `agent-traces.ts:62`；头注 `:1-16` | 无 | 中 |
| 跨机器读 | 前端按 session 所属机器把请求发给对的那台（`server: machineForSession(...)`） | `endpoints.ts:1130/1142/1155` | machines 面 | 高 |
| 上下文占用详情 | `GET /api/sessions/:id/context`：每次现读最新分片算组成，不流式 | `sessions.ts:1482`；`endpoints.ts:1094` | 无 | 中 |
| 派生索引 | `trace_files` / `trace_sessions` 是**可重建的缓存**（磁盘是唯一真源），mtime 门控 reconcile，新日期目录靠父目录 mtime 发现 | `db/schema.ts:186/198`；`services/trace-index.ts:1-26` | 无 | 高 |
| fork / 消息窗口 | `forkSessionTrace`（在某个位置从会话分叉）、`readMessagesPage`（带游标的窗口翻页） | `trace-service.ts:662/549`；`services/message-window.ts`（**未逐行读**） | 无 | 高 |

**Adelie 现状**

- **有**：事件溯源本身（append-only JSONL，8 种 `SessionEventType`），`GET /api/sessions/:id` 读回、`GET /api/sessions/:id/markdown` 导出（`docs/api.md:166-168`）；Web 有 `components/Timeline.tsx` + `lib/timeline.ts` 把一轮的事件画成时间线，`lib/history.ts` 把 `runs`+`events` 组装成轮次。
- **没有**：分片/上下文段概念、analysis、download、import、`GET /api/sessions/:id/trace*` 任何路由。对照 `docs/redesign.md:136-153`（§6）与 `:195`（P5 行）：**P5 未开始**。
- 一个真实差异值得记住：Adelie 的事件流是「一轮一事件」，Penguin 的 trace 是「模型真正看到的上下文」，这就是 Penguin 需要按压缩/换模型切分片的根因；Adelie 要抄 P5，分片边界只能自己定义（压缩 / 换模型 / 新建会话），`docs/redesign.md:149-152` 已经这么写了。

---

## 4. agents —— Agent 管理（指令、技能、配置）

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| Agent 列表 | GitHub 仓库列表式的单列紧凑行：名称 + agentId、截断描述、计数行（会话数 / 工具数）、30 天活跃 sparkline；计数各自深链到设置页对应 tab | `agents-page.tsx:131` `AgentsPage` + 头注 `:1-18` | 无 | 中 |
| 行内动作 | New Chat（草稿态）、Settings、Usage（`?agentId=` 深链到成本中心）、Delete（内置 Agent 显示不可删的灰占位） | `agents-page.tsx:1-18` | 无 | 低 |
| 创建向导 | 填名称/描述，并选新 Agent 的初装物：插件库的插件（技能 + 钩子包）、某目录 `.agents/skills` 或 `.claude/skills` 里的技能，多选面板带全选/全不选 | `agents-page.tsx:1-18`；`skills/skill-pick-list.tsx:1-18`；`directory-skills.ts:1-14` | 无 | 中 |
| 设置页九个 tab | Overview / System Prompt / Runtime / Tools / Skills / Hooks / Memory / Vault / Schedule | `agent-settings-page.tsx:128` + 头注 `:1-13` | 无 | 中 |
| Overview | 名称描述表单 + 两块「被规则划分」的区：Agent State（状态版本、快照导出导入、可复制的 State 路径）与 Kernel（默认代际、更新、恢复默认） | `agent-settings-page.tsx:1-13`；`agents/archive-download.ts`、`snapshot-file.ts` | 无 | 中 |
| System Prompt | `AGENTS.md` 与 `system_prompt` 两个编辑器 + 占位符参考 | `agent-settings-page.tsx:1-13`；`agent-config.ts:40/52` | 无 | 中 |
| Runtime / Tools | `max_turns`、`model.*`、`compaction.*`；内置工具表（可编辑）+ MCP Server 表单（增删改、按 transport 变字段、单测连接 / 批量测、第三种 `auto` 权限态） | `agent-settings-page.tsx`；`mcp-servers-section.tsx:116`；服务端 `agent-config.ts:88` `mcp-test` | 真实 MCP 服务端（测连接时） | 高 |
| 保存语义 | 只提交改动过的键，YAML 注释服务端保留 | `agent-settings-page.tsx:1-13` | 无 | 中 |
| Skills / Hooks / Memory / Vault / Schedule | 五个 tab，各自把「文件即真源」的列表 + 导入导出 + 开关拼起来 | `skills-tab.tsx:67`、`hooks-tab.tsx:65`、`memory-tab.tsx:132`、`vault-tab.tsx:42`、`schedules-tab.tsx:66` | 见 §5/§6/§7 | 高 |
| 提示注入开关（共用） | 每个功能一个 `X.enabled` 开关 + 模板缺 `{{X}}` 时的告警与一键插入/迁移 + 可编辑的提示段；开关只管「进不进上下文」，功能本身照常工作 | `prompt-injection-controls.tsx:102` `usePromptInjection` + 头注 `:1-18` | 无 | 高 |
| Memory | 按作用域分组（用户级在前，各 Workspace 一组），编辑既不在这里编辑文件：走「桥接弹窗（含生成提示的实时预览）→ 跳到新会话的草稿」；删文件顺手清 `MEMORY.md` 索引行；整组导出 / 导入（导入 owner only） | `memory-tab.tsx:132` + 头注 `:1-30`；`memory.ts:58/69/75/82/101/116` | 无 | 高 |
| Vault | Agent 级键值表（键、遮罩值、删除），整体替换语义：不在体内即删除，只发键名即保留原值；值永不回传前端；键名进系统提示，值只进 `exec_command` 子进程环境 | `vault-tab.tsx:42` + 头注 `:1-18`；`vault.ts:48` | 无 | 中 |
| State 导出 / 导入 | 导出任何成员可用（没有快照就现场打包 tar.gz）；导入 owner only，版本冲突要确认位 | `agent-transfer.ts:45/59` | 无 | 中 |

**Adelie 现状**

- **没有 Agent 实体**：`packages/web/src` 全仓搜不到 agent 目录/页面（只有「属于一次运行」的说法），服务端也没有 agents 相关表（`db.ts` 只有 `users` / `auth_sessions` / `sessions` / `user_settings`，见 `docs/redesign.md:262-267`）。`docs/redesign.md:37/174-186` 与 P6 行（`:196`）把它列为「更进一步」的目标。
- 结论：**这一面是 P4/P5 之后的前置**。Penguin 的九个 tab 里，对 Adelie 现在有意义的其实只有 System Prompt（= `ADELIE.md`）与 Vault（= 计划中的 Agent 级 `.vault.toml`），两者加起来就是每个 Agent 一个目录 + 一份配置 + 一个密钥文件，不需要 DB。

---

## 5. skills —— 技能库

`features/skills/` 只有 311 行：它不是「技能库页面」，而是**被别的面复用的选择器与图标**。真正的技能库在插件库里（见 §6），单个 Agent 的技能在 §4 的 Skills tab。

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 多选技能面板 | 搜索框、滚动上限、行样式、点击切换的语义；全选/全不选作用于**当前搜索命中的集合** | `skill-pick-list.tsx:1-18` | 无 | 低 |
| 选择顺序即发送顺序 | 选中的名字按点选顺序追加、置尾保持位置，切换会话不重排 | `skill-selection.ts:1-10`（`toggleSkillName` / `addSkillNames` / `removeSkillNames`） | 无 | 低 |
| 技能的图标 | 技能带的是**它来自哪个插件的图标**；没有就画书形 glyph | `skill-icon.ts:1-23`、`skill-icon-view.tsx:115` `SkillTile` | 无 | 低 |
| 已装技能列表 | Agent 设置 tab：插件图标 + 名称 + 本地化短描述 + 版本，卸载确认后删整个目录（含本地改动） | `agents/skills-tab.tsx:67` + 头注 `:1-20` | 无 | 中 |
| 安装 / 导出 | 两条路：推荐「对话安装」（源可以是网页 / 仓库 / 本地路径 / 别家命令，生成的「先审查后安装」提示可复制或预填到新会话）与 zip 上传（409 问是否覆盖）；每行也能把已装目录导出成 zip | `skills-tab.tsx:1-20`；服务端 `skills.ts:219/259`、`:287` 卸载 | zip / 网络 | 中 |
| 目录里的技能发现 | `GET /api/projects/:p/dir-skills?path=`：只读 `<path>/.agents/skills` 与 `<path>/.claude/skills`，别的什么都不列；路径要绝对、经 realpath、锚在 Project 访问权上 | `directory-skills.ts:1-14` | 无 | 中 |
| 模板占位符 | `POST …/skills/template-placeholder`：插入或迁移 `{{SKILLS}}` | `skills.ts:204` | 无 | 低 |

**Adelie 现状**：无技能概念（`packages/web/src` 无 skills 相关文件，服务端无 skills 路由）。Adelie 侧的 agent_state `/skills/` 是**本机 agent 的配置**，不是产品面 —— 别混。

---

## 6. plugins —— 插件

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 库列表 | 按分类分节、可折叠；每个插件一张卡：图标瓷片（按名字哈希取色的 skill 调色板 / 通过 sanitize 的内联 svg / 拼图 glyph）+ 名称（mono）+ 一行短描述 + 「N 个技能 + 每个 hook 点一枚徽章」+ 版本 · 被 N 个 Agent 使用 | `plugins-page.tsx:215` + 头注 `:1-30` | 无 | 中 |
| 旋转「更新安装」 | 只在**服务端说某个 Agent 的安装落后于库**时出现（前端从不比版本）；确认框列出每个 Agent 的旧→新版本并警告「覆盖重装会丢本地改动」，然后逐个重装 | `plugins-page.tsx:1-30`；`AgentSummary.pluginUpdates` | 无 | 中 |
| 纸飞机「快速开始」 | 进 `/chat/new` 草稿态，预选该插件里当前 Agent 已装的一个技能，并按界面语言预填调用文本；当前 Agent 没装它的技能则禁用 | `plugins-page.tsx:1-30` | 无 | 中 |
| 下载「管理安装」 | 列出 Project 里每个 Agent，逐个安装/更新；落后行带强调色 Update 按钮 | `plugins-page.tsx:1-30` | 无 | 中 |
| 详情弹窗 | 图标、完整描述、元数据与 hook 点 + 共享只读文件浏览器（每个技能一个目录、hook 包一个目录，可多开，右侧预览）；**一次请求**取回全部文件 | `plugin-detail.tsx:1-15`；`GET /api/plugins/:plugin/files` | 无 | 中 |
| 索引 / 详情页 | `/plugins/registry/*` 一个条目的元数据 + 长 readme（readme 单独取，因为列表每次访问都全量发、readme 大且只给打开的人） | `plugin-detail-page.tsx:37` + 头注 `:1-12`；前端接口 `endpoints.ts:1580` `getPluginIndex`，服务端 `/registry`、`/registry/readme` 见 `plugins.ts:1-23` 路由表 | 无 | 中 |
| 导入（上传 / 下载） | 两个对话框是同一个导入两次：一个带 zip，一个带 URL；409 `plugin_exists` 打开覆盖确认，确认后**重发同一个请求**带 `overwrite`（不用重选文件）；可选名称字段；末尾一块规则清单（来源、插件根怎么找、名字优先级、体积上限、重名怎么办）；14 MB 上限在**读之前**判 | `plugin-import-dialog.tsx:1-30`、`plugin-import.ts:20/1-14` | 网络 / zip | 中 |
| Project 要哪些插件 | 写在 Project 自己的配置里（`.project_config.toml` 的 `[plugins]` + `[plugins.<machineId>]`，Cargo 依赖表形状）；**实际加载的是所有 Project 的闭包**（一个进程一棵模块树） | `plugins-installed.ts:1-20` | 无 | 高 |
| 权限 | 库 / 目录 / 上传 / 下载 / 删除都是**安装级**资源，admin-only（服务端 403 `admin_required`，前端只对 admin 渲染入口） | `plugins.ts:1-23` | 无 | 低 |

**Adelie 现状**：无插件模型。注意区分：本机 agent_state 里那条「插件库 = `@penguinharness/*` 包，放自定义插件要装进 `/root/.penguin/lib`」是 **Penguin 自身**的机制，Adelie 没有任何对应物。

---

## 7. schedules —— 定时任务

这个面有两个入口、一套表单、一份缓存：**Agent 设置 tab**（属于这个 Agent 的任务）与**对话 dock 面板**（属于这个会话的任务）。

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| Agent 侧表格 | `agent_state/schedule/*.toml` 的表视图：状态徽章（由运行态派生）、「下次 / 上次触发」两行、拆分的创建按钮（AI 创建 / 手动设置）、空表时显示日常建议 | `agents/schedules-tab.tsx:66` + 头注 `:1-18` | 无 | 中 |
| 会话侧面板 | 当前会话的任务列表，可搜索、按状态过滤（全部/活跃/暂停/已完成），每行人话调度线 + 启用开关 + 溢出菜单（改/删）；头部两个创建按钮 | `schedule-panel.tsx:136` + 头注 `:1-16` | 无 | 中 |
| 共享表单 | `datetime-local` ↔ ISO 转换；「每次新会话」模式可选 Model（**永远是完整配对**）与 Workspace；`lockedSessionId` 把目标钉成一个只读行，新会话字段隐藏；每次打开都是新挂载 | `schedule-form-modal.tsx:198` + 头注 `:1-12`；`schedule-upsert.ts:1-38` | 无 | 中 |
| 人话调度线 | 「每天 08:00」「每周一 09:00」「每 30 分钟」、一次性任务相对今天、下次触发、已终结状态前置（「已结束 · 每天 08:00」）；纯函数、按调用者 locale | `schedule-describe.ts:1-12`（单测同名） | 无 | 低 |
| 状态桶 | `disabled` 归「暂停」，`done/expired/missed` 归「已完成」，`invalid` 只在「全部」里出现并在行上写明原因 | `schedule-panel-state.ts:1-10`（单测同名） | 无 | 低 |
| 日常建议 | 四条（每日简报、每周复盘、跟进提醒、更新监测），每条两种措辞：给会话的（发进当前会话）与给 Agent 的（开新会话） | `schedule-suggestions.tsx:1-12` | 无 | 低 |
| 会话列表上的闹钟标记 | 会话行显示「这个会话还有任务要触发」；与面板读**同一份 Project 级缓存**，避免两处说法不一致 | `schedule-store.ts:1-30` | 无 | 中 |
| 缓存何时更新 | 导航变化、窗口重新聚焦、`schedule_fired` / `schedule_queued` 事件、面板在屏时的慢轮询、每次面板自身的改动、以及「一轮结算」的边（一轮可能自己写了任务文件） | `schedule-store.ts:1-30` | 无 | 高 |
| AI 路径 | 「用 AI 创建」把请求预填进**本会话**的 composer（不自动发送） | `schedule-ai-modal.tsx:1-12`；`ai-create` 见 §9 | 无 | 中 |
| 服务端 | `GET|POST /api/projects/:p/agents/:a/schedules`、`/template-placeholder`、`GET|PUT|DELETE /:name`（文件名即身份）、`GET /api/projects/:p/schedules`（整个 Project 一张表，给会话行的标记用）；PUT 整文件替换、校验都过 `parseScheduleFile`，写立即经 reconcile 生效 | `schedules.ts:160/174/191/203/212/225/248` + 头注 `:1-14` | 无 | 中 |
| 运行时语义 | 文件=意图、运行态=SQLite（`schedule_state`）：不补跑错过的触发；会话忙则排队（每任务最多一份，等待期只前进不叠加）；绑定会话被删 → 记错误 + 标记 invalid，改文件即复活；mtime 门控扫描，不变的树零 readdir | `runtime/scheduler.ts:1-20`；`db/schema.ts:130-142`；`runtime/schedule-store.ts:1-12` | 无 | 高 |
| 权限 | 读任何成员；开关 / 改 / 删 owner only；AI 路径对所有人开放（「问 Agent」是发消息，不是写） | `schedules.ts:1-14`；`schedule-panel.tsx:1-16` | 无 | 低 |

**Adelie 现状**：无（`packages/web/src` 与 `packages/server/src` 都没有 schedule/定时概念）。这与 Adelie 现在的形态一致 —— 它只有「一次运行」。若要做，Penguin 给出的最小内核是：**声明文件 + SQLite 运行态 + mtime 门控扫描 + 忙时排队**，前端只需要一份共享缓存 + 一条人话调度线。

---

## 8. benchmark —— 评测

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 评测中心首页 | 每个 Benchmark 一张卡：最新分与「相对同标签上一条记录的变化」、scoreboard sparkline、上次评测时间、动作；顶部一段给新手的「循环」说明（写案例 → 评测 → 按分优化） | `benchmark-page.tsx:329` + 头注 `:1-12` | 无 | 中 |
| 归属 | Benchmark 是 Agent 的**平级**而非从属，所以是平铺列表；`?agentId=` 收窄到测过它的那些 | `benchmarks.ts:1-8` | 无 | 低 |
| 跨机器合并 | 列表读本机 + 它持有的每台机器（`benchmark-sources.ts`），行上标注是哪台机器读来的 | `benchmark-page.tsx:1-12` | machines 面 | 高 |
| 详情页 | 案例数与描述、案例列表、按**标签**（被测 Agent × 模型 × 思考档）分组的 Score 折线、评测表（行开弹窗）、案例浏览器（statement 与 rubric 两棵只读树，statement 的 README 自动打开） | `benchmark-detail.tsx:1-16`；`benchmark-case-browser.tsx:1-14`；`benchmark-detail-page.tsx:51` | 无 | 高 |
| 标签才是可比性单位 | Agent State 版本**不**参与分组（同一 Agent 的连续版本就是那条趋势线），版本只在悬停标签与表格列里出现 | `benchmark-metrics.ts:1-10` | 无 | 中 |
| 评测弹窗 | 该分所属系列、被测的 State 版本、三项存储指标、该评测的摘要、逐案例分与每次 run 的原始结果 + 它跑在哪个 Session；**每个数字都是 scoreboard 存的，不重算**；底部是「问 AI」而不是在屏上解释 | `evaluation-detail-modal.tsx:1-12` | 无 | 中 |
| AI 路径 | 提示尾巴点名 Skill 与参数（被测 Agent、Benchmark id、run 数、轮数、目标分），让新手一句话也能被 Skill 接住；两个 Ask AI 尾巴反过来：不点名 Skill，只带屏上已有的事实（分数与 Session id / 案例的两份材料路径），让答案从文件里读出来 | `benchmark-prompts.ts:1-12`；`use-benchmark-modal.tsx:170` | 无 | 中 |
| 手工建 Benchmark | 标题 / id / 描述 / 每案例 runs（≤ `MAX_RUNS = 1000`）/ 案例（statement + rubric）；**不选 Agent**（记在每次评测上）；格式提示常驻，语义放在「?」里 | `create-benchmark-modal.tsx:1-10`；`benchmark-prompts.ts:26` | 无 | 中 |
| 服务端与存储 | `GET|POST` 列表与手工创建（owner）、`DELETE /:id`（owner）、案例列表、案例文件与 rubric 文件的列表与内容；数据就是文件：`benchmark_config.toml`（有它才算一个 Benchmark，`status` = draft/published/failed）+ `scoreboard.yaml`（evaluations[]，每案例的模型写的平均分与 runs 数组）；损坏文件优雅降级、**不重算、不迁移、不回填** | `benchmarks.ts:143/149/174/182-192`；`benchmark-service.ts:1-25` | 无 | 高 |

**Adelie 现状**：无。Adelie 的 `benchmark-design` / `agent-evaluation` 是**本机 agent 的技能**，在产品里没有对应面。

---

## 9. ai-create —— AI 创建

这一面不是一个页面，而是**「让模型替你写一个对象」的通用管道**，被 models / benchmark / schedules / agents / plugins 五处引用。

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 桥接（核心） | 把提示写进 `/chat/new` 的草稿、把目标 Agent 切成当前的、跳到草稿页并在 `location.state` 里带上请求；**绝不自动发送** —— 到模型的东西永远是人读过并按过 Send 的；已有未发文本先寄存而不是被覆写 | `ai-bridge.ts:1-16`（`useAiBridge`）；`features/chat/draft-cache.ts`、`draft-sessions.ts` | 无 | 中 |
| 面板 | 「谁来做」+ 提示框 + 可点示例 + 固定尾巴的折叠预览与复制（新手能看见到底发了什么，老手能拿走） | `ai-create-panel.tsx:78` + 头注 `:1-8` | 无 | 低 |
| 弹窗 / 按钮对 | `AiCreateModal`（对话框包装）与 `AiCreateButtons`（「用 AI 创建」+「手动创建」） | `ai-create-modal.tsx:36`、`ai-create-buttons.tsx:17` | 无 | 低 |
| 提示组装 | 草稿 + 空行 + 固定指令尾巴；尾巴把一句愿望变成 Agent 能直接动手的请求 | `ai-create-prompt.ts:1-10` | 无 | 低 |
| 默认 Agent | `default_agent` 优先（它带着预装插件库，罐装提示是照着那些技能写的），没有就退到列表第一个，空列表则禁用发送 | `default-agent.ts:1-14` | 无 | 低 |
| 消费方 | models（加模型 / 加组 / 授权）、benchmark（建 / 评测 / 优化 / 问 AI）、schedules（建任务）、agents（记忆 / 技能 / 保险库的导入桥）、plugins | `models-page.tsx:84-85`、`benchmark-page.tsx:53-54`、`schedule-panel.tsx:47`、`agents/skills-tab.tsx:53`、`vault-tab.tsx:36` | 无 | 中 |
| 服务端 | **没有专门路由** —— 它只是「开一个带预填草稿的会话」 | — | 无 | 低 |

**Adelie 现状**：无这一层；等价物是用户自己在输入框里打字。对 Adelie 的成本很低（一次 `location`/状态跳转 + 一个受控面板），但**收益取决于是否已有别的面**（没有 Benchmark / Schedule，就没有可「AI 创建」的对象）。

---

## 10. harness —— 与 PenguinHarness 本体相关的面

Penguin 这个仓自己就是热更新的：运行中的 server 可以被 push 新版本，每次 push 记一棵模块树与一张接口表。这一个面把那段历史读出来给人看。

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 模块树视图 | 一个版本的整棵模块树：分组与节点，每个节点的 requires / provides / contributes / exports | `module-tree-view.tsx:1-6`（纯渲染，`GET /api/version/history/ifaces/:hash`） | 无 | 中 |
| 历史覆盖层 | **覆盖层不是页面**：关掉就回到原来的位置；列本数据根经热更新提交过的版本（最新在前），每条显示它改了什么 —— 出处、内容寻址的包、以及与前一版 diff 出的「出现 / 消失 / 重连的节点」「成员变化的接口」 | `harness-history-overlay.tsx:122` + 头注 `:1-8`；`:398` 挂模块树 | 无 | 高 |
| 回滚 | 覆盖层里可把某个版本回滚回去 | `harness-history-overlay.tsx:172` `startRollback`、`:175`；服务端 `version.ts:99` | 无 | 中 |
| 入口 | 命令面板里的一条命令（keywords: harness history / version / hmr / ifaces） | `features/palette/app-palette.tsx:43-45`、`:62` | 无 | 低 |
| 版本与自更新 | `GET /api/version`（身份 + 本数据根已 push 的 harness）、`/version/update-check`（软失败、缓存、可 opt-out）、`GET|POST /api/version/update`（admin，后台跑 `penguin update --yes`）、`POST /api/version/restart`（admin；**没有监督者时回 `no_supervisor`** 而不是停掉一个没人拉起来的服务） | `version.ts:69/74/112/118/123/134` + 头注 `:1-18` | supervisor（重启那条） | 高 |

**Adelie 现状**：无 HMR、无版本历史、无自更新（Adelie 是正常构建发布，`docs/issues/desktop-no-auto-update.md` 记着桌面端也不自更新）；
只有 `GET /api/health` 回 `version`（`docs/api.md:53`）。
**这一面短期抄不动**：它整个建立在 Penguin 的 kernel / 热更新机制与「一个 server 的多个版本共存」之上，Adelie 没有这套底座，硬抄只会得到一个空列表。

---

## 11. `usage` / `traces` 两面的完整机制（P4 / P5 专章）

### 11.1 用量：**只落 token，成本永远现算**

- **表**（`db/schema.ts:98-113`）：`usage_records(id, ts, date, project_id, agent_id, session_id, origin_session_id, provider, model_id, cache_read, cache_write, output, total, status)`。
  一行 = 一次 Request。`date` 是本地日期（和 Trace 的日期目录同一约定）；`(provider, model_id)` 永远是**配对**聚合；`status` 只用来算成功率（失败行 token 为 0）；
  注释里写得很直白：**cost is not stored: computed at query time from current pricing**。
- **价格从哪来**：core 的模型目录带三桶价（`pricing: {cache_read, cache_write, output}`，USD/百万 token，`core/src/state/model-catalog.ts:219-241`），
  支持**峰谷两档**（`offPeakDiscount` + `offPeakAt`，`:564`）与运行中的促销（`effectivePriceOf`，`:624-655`，`pricing` 存的始终是标价）；
  项目级的覆盖与促销状态落在 `model_promotions` 表（`schema.ts:16`，注释说明它「不是可重建的缓存」）。
  人民币价按固定汇率折成 USD 存储（`model-catalog.ts:526`）。
- **现算的入口**（`services/usage-service.ts`）：`PricingLookup` 类型（`:86`）→ `ratesAt`（`:178`，按记录自己的时间戳取档）→ `requestCostUsd`（`:156`）/ `costOf`（`:190`）；
  `query`（`:292`）把 token 汇总按 `(provider, model_id)` 分组后逐组查一次价，无价即从成本里剔除并置 `hasUncosted`。
  **好处**：调价不用回填历史（这正是 Adelie `docs/redesign.md:118-124` 抄的那条）。
- **查询与形状**：`GET /api/projects/:p/usage`（`usage.ts:94`）一次给全：`summary{today,last7d,total}` + `series` + `byAgentSeries` + `byModelSeries` + `agentIds` + `models` + `errors`（首页）。
  维度是 `groupBy=date|agent|model|session`；时间粒度 minute/hour/day/week/month；`minute` 必须带 `fromTs/toTs`（`usage-controls.ts:80-93` 解释了这条约束从界面上是怎么满足的）。
- **给别处用的两个额外方法**：`costBySession`（`:231`）与 `dailyCostForSessions`（`:263`）—— 我**没有读它们的调用方**，只知道它们存在（未核实具体展示位置；推测是会话列表与日历/组织的成本视图）。
- **错误**：`error_records` 表（`schema.ts:116-128`）+ 单一写入口 `runtime/error-recorder.ts`；`kind` 只有 expected/unexpected；消息截 500 字、**堆栈只进日志**；
  面板把「同一天同一错误的重复」折叠成一行、并显示重复次数（`errors-panel.tsx:1-9`）。
- **界面侧的三个非显然取舍**（都可以直接照搬到 Adelie）：
  ① 精度由范围决定，没有第二个控件；② 四张图共用一次空桶压缩以保持一条 x 轴（`usage-page.tsx:18-27`）；③ 徽标只在一行也读得出来的探针上算（`use-project-todos.ts`）。

### 11.2 trace：**文件是事实源，DB 只是可重建的索引**

- **写**：core 的 Trace Writer 按 `(sessionId, 编号)` 追加 JSONL；压缩 / 换模型时 rotate 到下一个编号。**只有「可记录」的消息落盘**（`partial_*` 不落）。
- **索引**：`trace_files` / `trace_sessions`（`schema.ts:186/198`）明确写着 DERIVED CACHE、「a row is never authority for absence」；
  同步三条路：写时登记（导入、删 Session）、mtime 门控 reconcile（热路径只 stat，不变就零 readdir）、强制 reconcile（`trace-index.ts:1-26`）。
- **读**：四种出口 —— 列表（会话内 / Agent 级）、事件分页（`trace-service.ts:873`）、分析（`:916`）、原始文件（`:1663` + 下载路由）。
  analysis 的内容：`request_begin/end` 最近邻配对 → 模型段；tool call 与 output 配对 → 工具段；重连 / 压缩计数；token 趋势；并给每轮 `messageFrom/To` 区间（前端因此能按轮拼消息）。
  另外还有 fork（`:662`，从某个位置分叉出会话）与带游标的消息窗口（`:549`）。
- **界面侧的三个非显然取舍**：① `trace-refresh.ts` 把「什么时候重取」抽成纯函数并单测，只为绕开 StrictMode 下边沿检测的坑（`trace-panel.tsx:55-70` 有完整说明）；
  ② 事件必须**翻完所有页**才能把每轮都填满，所以有一个顺序 pager 而不是只读第一页（`trace-events-loader.ts:1-14`）；
  ③ 高亮用「淡出其余」而不是描边，且按唯一 key 匹配而不是按时间戳（`timeline-chart.tsx:1-30`）。

---

## 12. 每个功能的「最小可移植版本」

**models**

- 模型表：先用**配置文件**而不是 DB —— 每组一个 `models/<provider>.json`（或直接扩 `model-catalog` 的用户层），`{ provider, modelId }` 作唯一键。
  读写一对路由：`GET` 遮罩密钥、`PUT` 整体替换（无 key 字段=保留）。
- 价格：模型条目上加三个数字（`cacheRead` / `cacheWrite` / `output`，USD/百万），先不做峰谷与促销 —— 那两样各是一层，可以后加。
- 默认模型指针：一条 `{provider, model}`，与模型表分开存（Penguin 就是分开的）。
- 元/余额/测速/协议探测/授权流：**先不做**。测速的最小版是「发一次 1 token 的请求，量首字时间与 tok/s」，一个函数就够。
- 「找模型」的那半（分组、折叠、拖拽、标记、搜索）在条目少于一屏时全是负成本，先不做。

**usage**

- 最小闭环三步：① 每轮结束把 `(ts, date, sessionId, provider, model, cacheRead, cacheWrite, output, total, status)` 追加到一份 JSONL 或一张表（Adelie 已有 `run_finished.usage`，只是缺归属字段，见 `docs/redesign.md:130`）；
  ② 一张价格表（每 `(provider, model)` 三档数字），成本**查询时现算**；
  ③ 一个 `GET /api/usage?from&to&groupBy=`，返回 `{summary, series, byAgent/byModel}`。
- 界面：先只做两样 —— 三张汇总卡 + 一条成本折线。**不要**先做 2×2 图表矩阵：四张图里最难的不是画，是「空桶压缩 + 共享 x 轴」（`usage-controls.ts:198-248`），而那部分可以等有真实数据再补。
- 错误表：**可以独立先做**，而且很便宜 —— 一个 `error_records` 表 + 一个统一写入函数（Adelie 的错误在 `turn.ts` / `http` 边界上已经集中），先只做「统计 + 最近 N 条」，不做清空。
- 不要抄的：`utcOffsetMinutes` 这类时区细节、`hasUncosted` 的上标星，等有第一个真实用户抱怨再说。

**traces**

- Adelie 已经有事件流，所以最小版是**在事件流之上一层派生**：
  ① 定义分片 = 一段模型上下文，边界取「压缩 / 换模型 / 新建会话」（`docs/redesign.md:149-152`）；
  ② `GET /api/sessions/:id/trace` → 分片索引（每片：事件数、token 累计、起止时间）；
  ③ `GET …/trace/:index/analysis` → 请求配对、工具耗时、压缩次数、token 趋势；
  ④ `GET …/trace/:index/download` → 原始 JSONL 附件（Adelie 已有直接把文件发出去的静态能力）。
- 界面：**先做「分片 pill 行 + 每轮统计卡」**，不要先做时间线。Penguin 的 CUDA 式时间线是一笔很大的投入（五种 bar、lane packing、缩放平移、联动高亮），而「每轮花了多少、在哪卡住」用统计卡就能回答八成问题。
- 刷新规则值得直接抄：把「什么时候重取」写成纯函数并单测（`trace-refresh.ts`），这是这类实时面板最容易出错的地方。
- 索引：Adelie 读事件流本来就快，**先不做派生索引表**；等 trace 变得很大（一个会话几百 MB）再引 `trace_files` 那种 mtime 门控缓存。

**agents**

- 最小版就是一个目录 + 一份配置：`~/.adelie/agents/<id>/{AGENTS.md, config.toml, .vault.toml}`，加 `GET|PUT /api/agents/:id/config`（只发改动键）。
- 「九 tab」里先做两个：**指令（AGENTS.md）** 与 **密钥（vault）**；技能/钩子/记忆/定时都依赖别的面，等它们存在了再给 tab。
- 提示注入开关那套（`{{X}}` 占位符告警 + 一键迁移）在只有一两个功能时是过度设计，等功能多到模型会忘记用它们再说。

**skills**

- 技能 = 一个目录 + `SKILL.md`（Adelie 的 agent 已经这么用了）。产品化只需要：**列表**（读 `skills/*/SKILL.md` 的 frontmatter）、**导入 zip / 导出 zip**、**卸载**。
- 多选面板（`skill-pick-list`）只有「发消息时能点选技能」才有意义，可以在有了会话级技能调用之后再抄 —— 抄的重点是「选择顺序即发送顺序」这条语义。

**plugins**

- 最小版是 skills + hooks 的**打包单位**：一个目录 + `plugin.json`，安装 = 把它的技能与钩子写进 Agent 目录。导入只要 zip 上传一条路，下载那条（服务端替用户取 URL）可以后加。
- 权限分界值得照抄：插件装到**安装级**目录（不是 Project 级），因此写操作是 admin-only；Project 只记「我要哪些」。

**schedules**

- 最小版四件套：① 声明文件 `schedule/<name>.toml`（含 `prompt` / `enabled` / `start_at` / `period` / `end_at` / 目标会话或工作区 + 可选 ModelRef）；
  ② 一个扫描器：启动时与每 30 秒 reconcile，比较 `last_slot`，**不补跑**，会话忙就排队一份（Penguin `runtime/scheduler.ts` 的语义可以整段照抄）；
  ③ 运行态存哪都行（一个 `schedule_state` 表或一个 JSON 文件）；
  ④ `GET|POST|PUT|DELETE` 四个路由，PUT 整文件替换、校验走同一个 parser。
- 界面先做 Agent 侧一张表 + 一个表单；**建议清单与 AI 创建后加**（它们是产品感的来源，不是功能的前提）。
- 「人话调度线」是一个纯函数，成本极低、观感极好，建议一起做（`schedule-describe.ts` 是很好的参照）。

**benchmark**

- 最小版：一个目录 + 两个文件 —— `benchmark_config.toml`（有它才算 Benchmark）与 `scoreboard.yaml`（评测记录数组，每个记 Agent / 版本 / 模型 / 思考档 / 每案例与总体分）。
  服务端只做**读**（列表 + 详情）与**手工建**（写那两份文件）；评测本身交给 Agent 技能跑，服务端不参与。
- 前端最小版 = 一张折线图 + 一张表；标签取「Agent × 模型 × 思考档」（不是版本），这条语义抄了就不会走弯路。
- 判分聚合**不要**服务端重算 —— 文件里的分就是权威（Penguin 明确不重算、不迁移、不回填）。

**ai-create**

- 最小版：一个受控面板 + 一次「把文本写进新会话草稿」的跳转，**绝不自动发送**。成本一天以内。
- 前提是已经有可创建的对象；否则它只是一个更好看的输入框。

**harness**

- **不建议移植**。Adelie 没有热更新内核，这一面在 Adelie 里会是空的。

---

## 附：这次**没有找到**的东西

- **没有跨 Project 的用量 / trace / benchmark 总览**：`usage`、`benchmark`、`traces` 全部挂在 `/api/projects/:p/…` 下，界面也没有「所有 Project」的入口。
- **没有独立的 Trace 浏览页**：源码里写得很明白 —— 「the standalone cross-Session browsing page is gone」（`trace-panel.tsx:1-8`），
  只剩「会话内 dock 面板 + Agent 级 HTTP 接口」；跨会话浏览靠 Agent 级列表 + 深链。
- **用量页没有导出（CSV / 账单）**：`getUsage*` 三个接口全是读聚合，没有任何导出路由。
- **没有「trace 的实时流式观看」**：面板靠「结算轮次边」重取整份文件（`trace-refresh.ts`），不是流式追加渲染 —— 文档里也把它写成取舍（「a Trace file GROWS during a run, so the ordinary refresh is the same file at a larger size」）。
- **`skills` 面没有独立页面**：`features/skills/` 只有选择器与图标（311 行）；技能库的浏览实际发生在插件库页与 Agent 设置 tab 里。
- **`ai-create` 没有服务端路由**：它完全靠草稿缓存 + 路由跳转（`ai-bridge.ts`），所以「用 AI 创建」不会在服务端留下任何痕迹，也无法在服务端校验。
- **没有找到 `costBySession` / `dailyCostForSessions` 的界面调用方**（未核实：可能是我漏读了调用点，也可能只有会话列表 / 组织视图在别处用）。
- 以下**我确实没有读**，本文对它们没有结论：
  - 前端：`features/chat/`（除被引用的 `chat-page.tsx` 行号）、`company/`、`machines/`、`messaging/`、`dock/`、`palette/`（除 harness 命令）、`settings/`（除 trace 导入行）、`terminal/`、`workflows/`、`semantic-id/`、`builtin-browser/`、`admin/`，以及 `state/`、`lib/` 的大多数文件（`strings.ts` 两份各 5000 行只看了用途）；
  - 服务端：`services/message-window.ts`、`context-breakdown.ts` 的实现，`http/routes/sessions.ts`（1600+ 行）除 trace/context 四行以外的部分，`runtime/session-manager.ts`、`usage-recorder.ts` 的实现，machines / messaging / organization / workflows / plugin 运行时；
  - `@prismshadow/penguin-ui` 的组件实现（只确认了图表用它的 `ChartFrame/ChartBar/ChartLine/ChartPoint`，不是手写 SVG）；
  - 测试与 e2e（`packages/web/test`、`packages/web/e2e`）只看到文件名，没有读内容；
  - **没有启动过 Penguin 的 server 或 Web**，所有 UI 描述都来自源码，没有截图或真机核对。
