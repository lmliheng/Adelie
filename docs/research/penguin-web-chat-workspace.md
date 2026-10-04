# Penguin Web 端功能清单（只读研究）：对话与工作台六面

> **研究日期：** 2026-10-04
> **依据版本：** `packages/web/package.json` version `0.2.13`（private 包 `@prismshadow/penguin-web`；
> react `^19.1.0`、react-router `^8.3.0`、zustand `^5.0.15`、`@xterm/xterm` `^5.5.0`、
> `react-markdown` `^10.1.0`，界面绘制另在 workspace 包 `@prismshadow/penguin-ui`）
> **范围（六个 feature 面）：** `packages/web/src/features/` 下的 `chat`、`dock`、`terminal`、
> `palette`、`workflows`、`builtin-browser` —— **123 个文件 / 31,243 行**
> （chat 80/22,836、dock 9/2,922、builtin-browser 21/2,874、terminal 10/1,985、workflows 2/561、palette 1/65）。
> **读了什么：**
> - 骨架全部：`app.tsx`、`router.tsx`、`module.json`、`lib/pages.ts`、`state/sessions.tsx`（头注释）、
>   `api/`（`client/sse/endpoints/session-probe/workspace-files` 的导出与调用前缀）、
>   `features/dock/*` 全部 9 个文件的头注释 + `dock-state.ts` 关键导出行号、
>   `features/terminal/*` 全部 10 个头注释、`features/builtin-browser/*` 除 3 个组件外的 18 个头注释、
>   `features/palette/app-palette.tsx`（全文 65 行）、`features/workflows/*` 两个头注释 + `lib/workflow-tabs.ts` 前 70 行、
>   `features/chat/` 约 25 个文件的头注释 + `chat-page.tsx:1960-2069`、`:2600-2719` 两个区段 + 全库 `grep` 定位
> - 服务端只读路由签名：`packages/server/src/app.ts`（挂载清单）、`http/routes/sessions.ts`、
>   `terminal/routes.ts`、`workflows/routes.ts`、`builtin-browser/routes.ts`
> - 用户文档：`packages/docs/content/builtin-browser.zh.md`、`web-app.zh.md`、`chat.zh.md`（只看大纲）
> - Adelie 侧：`packages/web/src` 全目录（`App.tsx` 全文、组件行数、关键词 `grep`）、
>   `packages/server/src` 路由 `grep`、`docs/api.md` §0–§7
>
> **判据：** 每条能力都要能落到一个组件 / 一个状态机 / 一条路由上，行号来自 `grep -n` 与逐段阅读。
> 未逐行读过的文件在表里标「（头注释，未逐行读）」，只在头注释里读到、没有在代码里核对的行为标「未核实」。
> 界面**绘制**几乎全在 `@prismshadow/penguin-ui`（`packages/ui/src/components/`，13 个分类子目录），
> 本文只读 `packages/web` 这一侧的容器，所以「UI 包怎么画」类的说法都来自容器注释，未核实。

## 0. 先摸到的信息架构

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 根组件 | `web/src/app.tsx:33` `App({initialPath})` | Provider 叠层：ClipboardWriter → CodeHighlighter → Locale → Theme → Auth → LocaleScope → Router；`initialPath` 存在时用 MemoryRouter（给嵌进别的文档用） |
| 路由 | `web/src/router.tsx`（`AppRouter`） | react-router v7 声明式。`/login` 公开；其余过 `RequireAuth`（挂 ProjectProvider + SessionsProvider + CompanyProvider + AppLayout）；`/terminal` 与 `/app/:projectId/:agentId/:workflowId[/:tabKey]` 走 `RequireAuthBare`，**在应用壳之外**全屏 |
| 页面登记表 | `web/src/module.json` + `web/src/lib/pages.ts` | 一个页面 = 一条 JSON（`path` / `nav` / `admin` / `released` / `renderer`），`PAGES` 由 `router.tsx` 的 `BUILTIN_PAGES` 注册渲染器；服务端 `GET /api/contributions` 可推送页面，`mergePages` 折进来（本 build 没有的渲染器就跳过） |
| 状态 | `web/src/state/` | `auth.tsx`(234) / `project.tsx`(198) / `sessions.tsx`(1481) / `company.tsx`(856) / `theme.tsx`(267) / `locale.tsx`(98) / `theme-prefs.ts`(96) / `use-completion-notifications.ts`(80) / `use-tray-locale.ts`(40) |
| API | `web/src/api/` | `client.ts`、`endpoints.ts`（全部路由调用的唯一去处）、`sse.ts`（`openSessionStream:67`、`openUserEvents:79`）、`workspace-files.ts`、`session-probe.ts` |
| 全局挂载 | `components/layout/app-layout.tsx:525-526` | `<BuiltinBrowserLayer />` + `<AppPalette />` 挂在壳上；侧栏 `sidebar.tsx`(3140) 是最大的单文件 |
| 用户事件通道 | `GET /api/events`（`api/sse.ts:79`） | 用户级 SSE：会话状态、workflow 更新、内置浏览器事件都从这一条连接扇出 |

**Penguin web 的规模感**：`packages/web/src` 共 412 文件 / 6.0 MB，其中六面 31,243 行只占约一半多一点 —— 剩下的是
`lib/`（约 24,000 行，含 `strings.ts`/`strings-en.ts` 各 5,000 行国际化、`lib/shortcuts/*` 约 1,500 行键位系统、
`lib/omni/stream-model.ts` 2,197 行的流 reducer）与其他 18 个 feature 面。

---

## 1. `chat` —— 对话主界面

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖（原生 / 外部服务 / 平台） | 复杂度 |
| --- | --- | --- | --- | --- |
| 页面与草稿态 | `/chat/:sessionId?`；`/chat/new` 是**还没落库**的草稿，首条消息发出时才建 Session | `features/chat/chat-page.tsx:307` `ChatPage`、`:294` `DRAFT_SESSION_ID`、`module.json` 的 `web.chat` | react-router | 中 |
| 流协议状态机 | 断线自动重连、`resync_required` 重建模型、`Last-Event-ID` 续传、history/live 去重 | `lib/omni/stream-controller.ts:1`（纯逻辑，无 React）、`features/chat/use-session-stream.ts:1`（React 适配）、`api/sse.ts:67` | 服务端 SSE + 事件缓冲重放 | 高 |
| 视图模型 reducer | 增量片段累积成完整项；`origin` 把子会话消息路由进嵌套模型；审批/中止/压缩各自成项 | `lib/omni/stream-model.ts:1`（2,197 行，**只读了头注释**） | 无 | 高 |
| 消息项分发 | 用户气泡（含图）、thinking 折叠块、Markdown 正文、工具卡、子代理卡、压缩横幅、中止标记、重连倒计时行 | `features/chat/message-item.tsx:171`、`message-stream.tsx:201`、`thinking-block.tsx`、`compaction-banner.tsx` | react-markdown；绘制在 UI 包（`MessageRow`/`AssistantText`） | 中 |
| 自动贴底 | 上滑**立刻**暂停跟随，回到底部 80px 内恢复；不靠「距底 80px」阈值判定退出 | `features/chat/stream-follow.ts:1`（纯逻辑，issue #75） | 无 | 低 |
| 工具调用卡 | 参数预览、按「参数生成段 + 执行段」计耗时（**排除审批等待**）、等待时沙漏、审批块就在卡下方 | `features/chat/tool-call-card.tsx:287`（pending 查表）、`:413`（pending 传参）、`process-list.ts:1` | UI 包的 `ToolCallCard` | 中 |
| 审批模式 | 三档 `always-ask` / `read-only` / `allow-all`；组织会话不提供 `always-ask`（无人值守时它等于拒绝） | `features/chat/approval-mode.ts:18` `APPROVAL_MODES` | 无 | 低 |
| 权限 + 沙箱菜单 | 输入区一行盾牌图标按钮，菜单三组：Filesystem / Network / Approval，管理员多一条「More…」进设置沙箱卡；**本机强制不了的档位置灰而不是隐藏** | `features/chat/permission-select.tsx:1`（头注释，未逐行读）、`lib/permission-level.ts` | 服务端 sandbox 后端（`packages/server/src/sandbox`） | 中 |
| 输入卡 | multiline textarea + **单行**控件带（附件 · 审批模式 · 帮助文案 ｜ 上下文环 · 模型 · 发送）；Enter 发送、Shift+Enter 换行、图片粘贴、`+` 菜单收文件（base64 随任务发，服务端写进 scratchpad 并补 `[attached file: …]`） | `features/chat/chat-input.tsx:1`（2,589 行，只读头注释与若干区段） | UI 包 composer | 高 |
| 斜杠命令 | `/` 开菜单：`/compact`、`/model`、`/agent`，加每个已装技能一条；`/model` 与 `/agent` 是**暂存**——变成输入框上方的 chip，Enter 时才生效（换 agent = 切到新会话；换 model = 复制出新会话） | `chat-input.tsx:1312`(/compact)、`:1342`(/model)、`:1359`(/agent)、`slash-token.ts:20` `matchSlash` | 无 | 中 |
| 模型选择 | 弹窗：搜索、供应商分组轨、已配 key 优先；会话内切换走工具栏选择器（先确认再压缩一次） | `features/chat/model-picker-modal.tsx:1`、`model-select.tsx:40` `ModelCatalogSelect`、`model-picker-logic.ts` | 服务端模型目录 + key 配置 | 中 |
| 会话工具栏 | 标题 / 状态 / 图标化统计 / 两个面板开关 / 详情弹窗 / 大纲回退按钮 | `chat-page.tsx:2274`（DockToggles）、`:2294-2305`（details）、`dock-toggles.tsx:1` | 无 | 中 |
| 成本 chip | 会话级累计成本，跑动期间**单调不闪**（fetch 基础 + 本地结算 + 开放 Task 增量，三条抑制规则） | `features/chat/header-stats.ts:1`（纯逻辑，有单测 `test/header-stats.test.ts`） | 服务端 usage 行 + 定价 | 中 |
| 每轮统计行 | 回复底部的 输入↑ / 输出↓ / TPS / 耗时 / 成本 + 时间戳 + 复制 + 分叉；窄屏砍 TPS | `features/chat/task-stats-line.tsx:1`、`lib/omni/task-stats.ts`(498) | 无 | 中 |
| 上下文环 | 输入框右侧圆环，点开显示上下文构成；`/compact` 压缩 | `features/chat/context-gauge.tsx:1`（835 行，头注释）| `GET /api/…/sessions/:sessionId/context`（`http/routes/sessions.ts:1482`） | 中 |
| 对话大纲 | 消息流左侧零宽 tick 轨 + 悬浮预览卡；长会话只渲染阅读位附近的滑窗；无 hover 的窄屏回退成工具栏菜单按钮 | `features/chat/conversation-outline.tsx:1`、`outline-model.ts:172` | 无 | 中 |
| 子代理面板 | 一轮 Task 的调用图 + 被选中子会话的**实时对话**（复用同一套 MessageStream/StreamModel，含嵌套审批） | `features/chat/subagents-view.tsx:1`、`agent-topology.ts`(537) | 子会话消息走同一 SSE（带 `origin`） | 高 |
| 文件面板 | 目录树 + 预览（Markdown/HTML 带源码切换、文本高亮、图片缩放、PDF 内嵌、其余下载）+ 就地编辑 + 拖入上传 + 新建/改名/移动 + 面包屑 | `features/chat/workspace-browser.tsx:1`（2,811 行，只读头注释）；`api/workspace-files.ts` | 服务端文件路由（沙箱内路径校验） | 高 |
| Workspace 选择器 | Finder 式模态：浏览服务端目录、可直改路径、**可选机器**（非本机走 ssh） | `features/chat/workspace-select.tsx:1`、`workspace-finder.tsx:1`(1,438)、`workspace-finder-model.ts:574` | 服务端 `dirs` 路由；跨机时 ssh | 高 |
| 后台进程列表 | 详情弹窗列出会话起的进程（15s 轮询，只在可能变化时跑），可 Stop / Remove / 批量 Clear exited | `chat-page.tsx:1090`、`:1125-1182`、`features/chat/process-list.ts:1` | `GET /:sessionId/processes`、`POST …/kill`、`DELETE …/processes/:id` | 中 |
| 流内选中菜单 | 选中文本 → 复制 / 加入对话；网页链接 → 在内置浏览器打开 / 系统浏览器打开 / 复制地址 | `features/chat/stream-selection-menu.tsx`（**未逐行读**） | 桌面壳判定 | 中 |
| 消息文件卡 / 回复里的链接 | 点开即在 Files 面板定位到那个文件 | `chat-page.tsx` 的 `onOpenFile`（见 `:1-14` 头注释） | 无 | 低 |
| 草稿页 | 空会话一张竖排居中的卡：Agent / Workspace 下拉 pill、模型选择器在发送键左侧、思考等级仅草稿可选；四个选择自动缓存（按「用户 × Project」隔离键），发送成功后只留下模型选择作为下一次默认 | `features/chat/draft-view.tsx:1`（1,169 行，头注释）、`draft-cache.ts:230`、`new-chat.ts` | localStorage | 高 |
| 会话列表状态 | 按 Agent 分组、按 (Agent, 类别) 分页（active 默认，archived/subagent/schedule/benchmark 展开才拉）、只取自己的会话（`excludeOrg`）、实时状态对**每个** `session_state` 都记 | `state/sessions.tsx:1`（1,481 行，头注释） | zustand + `GET /api/sessions` + `GET /api/events` | 高 |
| 完成通知 | 窗口失焦时任务跑完弹系统通知，点击聚焦并打开会话 | `state/use-completion-notifications.ts`（桌面端研究已引，本次**未读**） | `Notification` API | 低 |

**服务端接口（本面用到的）**：`http/routes/sessions.ts` —— 列表 `:524`、建 `:570`、详情 `:644`、fork `:742`、删 `:807`、
`/messages:899`、`/stream:978`（SSE）、`/tasks:1017`、`/steer:1097`、子代理发消息 `:1150`、
`/approvals/:toolCallId:1241`、后台化 `:1265`、`/abort:1281`、`/processes:1294`、`:1314`、`:1331`、
`/compact:1361`、`/switch-model:1371`、`/context:1482`、`/traces:1495`。

### Adelie 现状（`grep`/`ls` 对着 `packages/web/src` 与 `docs/api.md` 核过）

**有**：侧边会话列表（`components/Sidebar.tsx`，164 行）、流式对话（`hooks/useAdelie.ts` 按会话分桶 + `api/sse.ts`
手写 SSE 解析）、工具时间线（`components/Timeline.tsx` 132 + `ToolCard.tsx` 84）、审批（`ApprovalCard.tsx` 113 +
`POST /api/sessions/:id/approvals`）、设置与用户管理（`SettingsDialog.tsx` 478、`UsersDialog.tsx` 223）、登录
（`LoginScreen.tsx` 150）、空态（`EmptyState.tsx` 106）。合计 17 个组件 / 2,265 行组件代码，`packages/web/src` 共 7,482 行。

**差什么**（逐条对着上面表）：
1. **路由与页面层**：`react-router` 在 Adelie web 里 **0 命中**，`App.tsx` 用一个 `useState` 切抽屉/对话框，没有 URL 化的页面。
   → 没有 `/chat/:id` 深链、没有 `/chat/new` 草稿态概念（`App.tsx:150` 的 `Composer` 在没有活动会话时直接由服务端建会话再发）。
2. **状态层**：`zustand`、`dock`、`palette` 各 0 命中；状态全在 `useAdelie.ts` 一个大 hook 里。
3. **数据模型不同源**：Adelie 的流是 `run_started / delta / event / approval_request / run_finished / error / done`
   （`docs/api.md:189-199`），Penguin 是 OmniMessage 的 `partial_*` 片段 + `complete` + 事件。
   → `lib/omni/stream-model.ts` 不能直接搬，但「片段累积 / origin 嵌套 / 审批标注」的思路可以照搬。
4. **没有的能力**（缺的是这些具体件，不是一个「无」字）：markdown 渲染（没有 `react-markdown` 依赖）、
   斜杠命令、模型弹窗（模型在 `SettingsDialog.tsx:62-65` 的下拉里选）、附件与图片、思考等级、
   上下文环、成本与定价（`run_finished` 只给 token 数，没有 usage/定价路由）、对话大纲、子代理视图
   （Adelie 无 subagent 概念）、文件面板（服务端**无** `/api/files`、`/api/workspace` 路由）、
   Workspace 选择器（`workspace` 只在 `GET /api/config` 里当字符串）、后台进程列表、流内选中菜单、
   草稿缓存、会话分类与分页（`GET /api/sessions` 一次返回全部，无 `?category`/分页参数）。
5. **没有用户事件通道**：服务端 `grep '/api/events'` **0 命中**，所以没有跨会话实时状态推送 ——
   会话列表的 164 行 `Sidebar.tsx` 只靠 `useAdelie` 里当前会话的流更新自己那一条。

---

## 2. `dock` —— 侧边停靠面板

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 两条停靠面 | 右侧一条 + 底部一条，**每个侧边元素都是其中一条里的一个标签**；工具条两个拉开的开关 | `features/dock/dock-state.ts:40` `DockPosition`、`dock-toggles.tsx:1`、`chat-page.tsx:2274` | 无 | 高 |
| 面板种类（单例） | `agents / workspace / memory / trace / messaging / schedules / builtin-browser` 各一个标签；**终端是每 shell 一个** | `dock-state.ts:51` `PANEL_KINDS`、`panel-meta.tsx:13` `panelLabel`、`chat-page.tsx:1969` `renderPanel` | 各面板自身（见 §1/§6） | 中 |
| 面板体的来源 | 面板体由**页面**提供（它们需要页面的 session/stream 状态），通过 `DockPanel` 的 `renderPanel` 注入 | `chat-page.tsx:1969-2069`、`dock-panel.tsx:179` | 无 | 中 |
| 空 dock 落选择器 | 打开一条没有标签的 dock，落到「选择在这里开什么」的 picker；`+` 菜单可加面板 / 新 shell / 任意活着的 shell | `dock-panel.tsx:179`、`dock-state.ts:607` `openPanel` | 无 | 中 |
| 布局按会话隔离 | 每会话一套 arrangement，切会话整套换；草稿期的安排**交给**首个消息建出的会话 | `dock-state.ts:291` `adoptDockScope`、`:328` `currentDockScope` | localStorage（一个条目，LRU 老化） | 高 |
| 尺寸是全局偏好 | 宽/高只有一个偏好，不随会话变；低于桌面断点两面**合并成一条底部面**，变宽再拆开 | `dock-state.ts:1`（头注释）、`chat-page.tsx:1960` `closedDockView("bottom")`、`use-panel-width.ts:182` | 无 | 中 |
| 隐藏 ≠ 卸载 | 关 dock 只是收到 0 尺寸（`closedDockView`）：滚动位置、下钻、未保存的编辑器都还在；只有「一个标签都不剩」才卸载 | `use-dock-mount.ts:1`、`dock-state.ts:451` `closedDockView`、`dock-state.ts:264` `instantVersion`（切 scope/跨边搬动动画免掉） | 无 | 中 |
| 拖拽换边 | 拖标签（或整条 dock 的头）到另一条边，带半透明落点预览；两种判定：边缘带 45% + 右下角投放挂件 | `dock-drag.tsx:1`、`:1` 后前 30 行的 `dockDropCandidate` | Pointer Events + `elementFromPoint`（pointer capture 下 CSS hover 不触发） | 中 |
| 浮动启动器 | AssistiveTouch 式球贴在对话区右缘，点开环形展开 7+1 个入口，球上写当前指到的名字；可拖动、可永久收起（全局偏好） | `dock-launcher.tsx:1`、`dock-launcher-state.ts:18` `LAUNCHER_Y_KEY`、`:18` `LAUNCHER_HIDDEN_KEY` | 无（位置直接写 DOM + 弹簧驱动，不过 React state） | 中 |
| 关闭守卫 | 带未保存内容的标签关闭前先问；每个守卫是个 `() => Promise<boolean>` | `close-guard.ts:1` | 无 | 低 |
| 拆出终端 | 终端标签 detach 成 `/terminal?id=…` 独立窗口，关掉回到停靠面 | `dock-terminal.ts:128` `openTerminalInDock`、`terminal-page.tsx`；桌面壳侧审批放行（见桌面端研究 §3.1） | `window.open` + 壳的窗口分类策略 | 中 |
| 终端视图池 | 终端在两条 dock 之间、整条 dock 换边时不重挂 xterm、不断 WebSocket | `terminal-view-pool.tsx:1`（portal 到一个自己持有、永不销毁的容器 div） | 无 | 高 |

### Adelie 现状

**无**（`dock` 0 命中；无面板注册表、无布局持久化）。**缺的是三样**：
(1) 一个能容纳停靠面的宿主 —— `App.tsx` 现在是 TopBar + Sidebar + main 的固定三段式，`main` 里只有
`.messages` 与 `Composer` 两块；
(2) 一个「面板种类 → 渲染器」的注册表（Penguin 是 `PANEL_KINDS` + `panelLabel` + 页面注入的 `renderPanel` 三件套）；
(3) 布局持久化 —— Adelie 的 `lib/credentials.ts` 只存连接信息，`localStorage` 没有被用来存界面偏好。
**可以先只做右侧一条**：Adelie 已经有天然的面板候选（文件变更 / 审批历史 / 工具输出），但没有一个能同时挂载的骨架。

---

## 3. `terminal` —— 内置终端界面

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| xterm 终端面 | 一个可复用的终端组件，两个宿主（独立页 / dock）共用同一份 attach/restore/resize 行为 | `features/terminal/terminal-view.tsx:1`、`:292` 动态 `import()`、`:607` `new WebSocket(streamUrl…)` | `@xterm/xterm` + `addon-fit` / `addon-web-links` / `addon-clipboard`（**运行时才 import**，不进主包） | 高 |
| 二进制帧协议 | 用户无感；无 JSON parse 在热路径上，噪声 build 不卡 UI 线程 | `terminal-frames.ts:1`（opcode：Output 0x01 / Input 0x02 / Resize 0x03 / Restore 0x05 / Exit 0x06） | **必须与** `packages/server/src/terminal/frames.ts` 同步 | 中 |
| 独立页 + 深链 | `/terminal` 全窗口、不在应用壳里；`?id=` 精确附着、`?cwd=` 建在那个目录、`?name=` 显示名、`?machine=` pty 在哪台机 | `terminal-page.tsx:120` `TerminalPage`、`:58` `parseTerminalParams`、`router.tsx` 的 `RequireAuthBare` | 无 | 中 |
| attach / restore | 重新附着时服务端回一个 Restore 帧整屏重绘（scrollback/颜色/光标/输入模式），shell 本人无感 | `terminal-page.tsx:1`（头注释）、服务端 `terminal/stream.ts` | 服务端 pty（`node-pty` 原生模块） | 高 |
| id 写回 URL | 附着后把 id 用 `replaceState` 写回地址栏，刷新/复制地址都能回到同一个 shell | `terminal-page.tsx:1`（头注释） | 无 | 低 |
| id 失效兜底 | `?id=` 指到已消失的终端时，用 URL 的 cwd/name 新建一个，永不落到死局 | `terminal-page.tsx:1` | 无 | 低 |
| 活终端列表 | 工具栏菜单列出用户所有 shell（已开标签的 + 没开的），任一都能拉进当前窗口 | `terminal-list.ts:93` `terminalApiSupported`、`terminal-list.ts:1`（头注释） | `GET /api/terminals`；**没有推送通道** → 生命周期各步直调 refresh + 慢轮询 + 窗口聚焦刷新 | 中 |
| 触摸键栏 | 手机上的 Esc / Tab / ↑ / Ctrl+C；Ctrl 与 Alt **粘滞一次性**；按下不夺焦点（软键盘不收） | `terminal-keybar.tsx:1`、`terminal-keys.ts:1` | `(pointer: coarse)` | 中 |
| 触摸滚动 | 全屏程序（备用屏，无 scrollback）里手指拖动 → 按指位转成滚轮报文；一行行程抵一行 | `terminal-touch.ts:1` | 无 | 中 |
| 终端链接 | 输出里的 URL 与 OSC 8 超链接都能点开；**scheme 白名单**（终端输出不是可信输入）；点击判定自己实现（全屏程序每帧重绘会让 xterm 的对象同一性检查失败） | `terminal-links.ts:1` | `@xterm/addon-web-links` | 中 |
| 终端外观 | 终端有自己的深浅设置，与 app 主题解耦（终端的 chrome 用 JS 解析类名，不走 Tailwind `dark:`） | `terminal-appearance.ts:1` | 无 | 低 |
| 服务端 | 列举 / 建 / 查 / 删 / capture / 发键，加一条 WS upgrade | `packages/server/src/terminal/routes.ts:115-137`、`terminal/ws.ts:49` | `node-pty`（打包时要落真实包目录，见桌面端研究 §3.6） | 高 |

### Adelie 现状

**无**：`xterm` 0 命中、`terminal` 在 web 里只有 3 次命中（都是 `ToolCard`/`Icon` 的文案或图标名），
服务端 `grep '/api/terminals'` 0 命中，`docs/api.md` 没有终端章节。
（Adelie 自己的 `docs/desktop-parity.md:24` 已经记过同一件事：「终端面板、文件浏览器、内置浏览器都不存在」，
`:73` 把「拆出终端窗口」列为「缺前置」。）**缺的是三层**：
1. **服务端没有长连接数据面** —— Adelie 只有 SSE，且是「一轮 `POST /messages` 对应一条流再关掉」的模型
   （`docs/api.md:184`），没有一个由用户驱动、可写可读的持久连接。要么加 WS，要么用 SSE +(POST) 拆成两条半双工。
2. **pty 与原生模块** —— 走 node-pty 就得付 Penguin 在桌面上付过的打包税（asar 关闭、prebuilds 落盘、darwin `spawn-helper` chmod 755）。
   想避开原生依赖，最小替代是「服务端一个 shell 子进程 + `child_process.spawn` 的管道」（没有 TUI 全屏支持，但 `ls`/`git`/`npm` 够用）。
3. **前端 xterm 与 fit/clipboard/web-links 三个 addon** 是新依赖。

---

## 4. `palette` —— 命令面板

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 命令面板 | 一个弦（默认 ⌥⌘P / Ctrl+Alt+P）打开浮层，动作**在当前页上开覆盖层**而不是导航 —— 关掉还在原地 | `features/palette/app-palette.tsx:23` `AppPalette` | UI 包的 `CommandPalette` | 低 |
| 动作注册表 = 挂载点的扩展面 | 常设动作只有一条「harness 历史」；其余靠挂载点传 `extra` —— 全页 workflow 路由就是这样把「退出全页」塞进来的 | `app-palette.tsx:23` 的 `extra`、`workflow-app-page.tsx:30` | 无 | 低 |
| 版本历史覆盖层 | 面板里那条动作用来打开 harness 的版本/接口历史 | `app-palette.tsx:1`（头注释）、`features/harness/harness-history-overlay` | HMR 包 | 中 |
| 全局键位系统 | **一个动作 = 一条命令**，不新增全局监听器；弦由 `lib/shortcuts/` 的窗口分发器匹配并 preventDefault | `palette/app-palette.tsx:1`（头注释）、`lib/shortcuts/dispatcher.ts`(83)、`registry.ts`(111)、`reserved.ts`(331)、`store.ts`(289)、`use-keymap.ts` | 无 | 高 |
| 挂载点 | 只在应用壳挂一次 | `components/layout/app-layout.tsx:526` | 无 | 低 |

### Adelie 现状

**无**（`palette` 0 命中）。**缺的是两件，且第二件比面板本身值钱**：
1. **一个浮层组件** —— 可以只用 `role="dialog"` + 输入过滤 + ↑↓ 自建（约 100 行），不必引 cmdk 类新依赖。
2. **一套键位分发约定** —— Adelie 现在只有散落的原生监听：`App.tsx:112`（Esc 关抽屉）、
   `SettingsDialog.tsx:126`、`UsersDialog.tsx:52`、`Sidebar.tsx:120`、`Composer.tsx:78`。
   先把「命令表 + 单一 window 分发器 + reserved 键清单」立起来，命令面板才有东西可列，快捷键冲突才有地方判。

---

## 5. `workflows` —— 工作流页

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 工作流标签条 | 对话旁一排标签，列出该 Agent **带 UI 的** workflow（纯 handler 的 workflow 不出标签） | `workflow-tabs.tsx:102` `WorkflowTabStrip`、`lib/workflow-tabs.ts:18` `WorkflowTab` | 服务端 `workflows` 路由 | 中 |
| iframe 帧 | workflow 自己的 `ui/` 目录作为页面挂进来 | `workflow-tabs.tsx:169` `WorkflowFrame`、`lib/workflow-tabs.ts:54` `workflowUiUrl`（URL 带 `?rev=<uiRev>`） | **iframe** + 服务端 `GET /:id/ui/*`（`workflows/routes.ts:255`） | 中 |
| 版本与回滚 | 帧上一条细 bar：版本号、当前文件启动不了时的**加载错误**、重载、历史折叠（每个版本一个恢复按钮） | `workflow-tabs.tsx:1`（头注释） | `POST /:id/reload:223`、`GET /:id/history:231`、`POST /:id/rollback:238` | 中 |
| 热更新 | Agent 改了自己的 workflow，标签实时更新（服务端广播 → 重取列表 → iframe 换 key） | `lib/workflow-tabs.ts:41` `WORKFLOW_UPDATED_EVENT`、`workflow-tabs.tsx:1` | 用户事件通道 `GET /api/events` | 中 |
| 全页路由 | `/app/:projectId/:agentId/:workflowId[/:tabKey]`：没有侧栏、没有对话、没有标签条，就是这一页铺满窗口 | `workflow-app-page.tsx:30` `WorkflowAppPage`、`router.tsx` | react-router；**出口只有命令面板**（`forwardFrameKeys` 把帧内按键回传） | 中 |
| 主题与键盘穿透 | iframe 跟随应用主题；帧内按键回传给壳（退出全页靠这个弦） | `lib/workflow-theme.ts`（153）、`workflow-app-page.tsx:1`（头注释） | 无 | 中 |
| 服务端 | 列举 / reload / history / rollback / 删 / 托管 `ui/` 静态 | `packages/server/src/workflows/routes.ts:218-255` | 无 | 中 |

### Adelie 现状

**无**（`workflow` 0 命中；服务端 `grep` 无 workflows 路由）。**这是六面里离 Adelie 最远的一面**，因为它要求的不是一块 UI，
而是一整条产品链：Agent 能写出一个带 UI 的产物 → 服务端发现并托管它 → 前端把每个产物挂成标签 + 一个全页路由 + 版本回滚。
Adelie 现在连它的前置件都没有：无 `/api/skills`、无 `/api/agents`、无「项目/Agent」这层概念
（`docs/api.md` §0–§7 只有 health / auth / users / sessions / messages / approvals / config / models / tools / shutdown）。
**可移植的最小切片**与 workflow 无关：先要「服务端托管一个前端产物目录 + 前端 iframe 挂载 + 按内容 hash 换 key」这三步。

---

## 6. `builtin-browser` —— 内置浏览器面板

| 能力 | 用户看到什么 / 能做什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 停靠面板 | 与终端并列的面板：标签条 + 工具栏（后退/前进/重载/停止）+ 地址栏 | `browser-panel.tsx:79` `BuiltinBrowserPanel`、`browser-tab-strip.tsx:62`、`browser-toolbar.tsx:90`、`address-bar.tsx:39` | Electron `<webview>` | 高 |
| 页面宿主层 | 页面**不在** dock 里：一个固定层按坐标把页面盖到 dock 的 slot 上（active 覆盖可见部分，其余离屏停放**保持桌面尺寸**） | `browser-layer.tsx:258` `BuiltinBrowserLayer`、`geometry.ts:1`（矩形算术）、`slot-registry.ts:1` | `<webview>` 一移动就重载 → 所以必须这样，且 guests 只追加/删除、永不重排 | 高 |
| 状态 reducer + store | 两份列表：服务端的 tabs 注册表（地址/标题/加载/历史/哪个 active）＋ 本窗口托管的 guests | `browser-state.ts:95` `INITIAL_BROWSER_STATE`、`browser-store.ts:1` | 用户事件通道 `builtin_browser_tabs` 等 5 种事件（`browser-events.ts:1`） | 高 |
| 地址栏规则 | 纯函数：`http/https` 原样、`about:blank` 允许、裸域名补 scheme（公网 https、回环/IP http）、其余 → Bing 搜索 | `address.ts:1`（`SEARCH_URL` / `BLANK_URL`） | 无 | 低 |
| 历史建议 + 键盘 | 输入时列历史页面，↑↓ 循环（含「回到你输入的文字」这一项） | `suggestion-nav.ts:1` `moveHighlight` | 服务端 `GET /history` | 低 |
| 能力探测 | 非桌面 / 旧壳：面板明说用不了（服务端返回 `browser_unavailable`） | `browser-state.ts:244` `browserOffered`、`browser-actions.ts:1` | `GET /status` | 低 |
| 清数据 / 主页 | 两个对话框 | `clear-data-dialog.tsx`(89)、`homepage-dialog.tsx`(110)、`import-options.ts`(86) | `POST /clear-data:351`、`PUT /settings:327` | 中 |
| 导入系统浏览器登录态 | 工具栏菜单「从浏览器导入…」，选站点后带账号浏览 | `import-dialog.tsx`(221)、`import-options.ts:1` | 平台钥匙串 / DPAPI（Shell 侧）+ `GET /import/sources` | 高 |
| Agent 驱动页面 | Agent 开/关页面、标记正在操作的标签；窗口认领 tab（先认领者赢，409 移除副本）、把在屏标签报给服务端（250ms 静默）以便节流其余 | `browser-layer.tsx:258`、`on-screen-report.ts:1` `ON_SCREEN_SETTLE_MS=250`、`guest-id.ts:1` | CDP（壳侧 `packages/desktop/src/builtin-browser.ts`） | 高 |
| 负载警告 + 崩溃恢复 | 工具栏琥珀标记 + 每个重标签一行 tooltip；崩溃页显示「此页面已崩溃 / 重新加载」 | `load.ts:1`（`formatMemory`）、`browser-panel.tsx:1` | 服务端 metrics（约 10s）与阈值判定 | 中 |
| 服务端 | `status / tabs / claim / on-screen / activate / navigate / scan / exec / click / type / screenshot / cdp / import / settings / history / clear-data` | `packages/server/src/builtin-browser/routes.ts:125-351` | 壳侧 CDP debugger；只有**管理员**可调 | 高 |

**官方限制（读自 `packages/docs/content/builtin-browser.zh.md:143-155`）**：仅桌面应用可用；标签最多 20 个；
负载警告阈值 = 合计 1.5 GB / 本机可用内存 <10% / 超过 12 个标签；`scan` 正文默认 35,000 字符；
`exec` 返回 8,000 字符；`exec` 脚本 15s；页面加载最多等 15s；历史保留最近 5,000 条；
Windows 上 Chrome 127+ 的应用绑定 Cookie 无法导入。

### Adelie 现状

**无**（`webview` 0 命中；服务端无 builtin-browser 路由）。Adelie 自己已经就这一面做过取舍：
`docs/desktop-parity.md:72` 把「内置浏览器」整条判为**不值得抄** ——「这是**一整个产品特性**，不是桌面壳的能力。
Adelie 的定位是「会话 + 工具时间线」，加内置浏览器等于换产品」。所以这里记录的是「要抄的话得补哪几层」，不是推荐。
**差的是三层，且第一层就是硬门槛**：
1. **Electron `<webview>`** —— 官方文档明写「仅桌面应用」（`builtin-browser.zh.md:147`），Web App 里这个面板是隐藏的。
   Adelie 的桌面包 `packages/desktop` 若已用 Electron，`webviewTag` 是壳侧一行开关；纯浏览器版本**没有等价物**
   （`<iframe>` 会被 `X-Frame-Options`/CSP/frame-ancestors 挡掉绝大多数站点）。
2. **壳侧 CDP 桥** —— 面板能「浏览」只需要 `<webview>`，但 Agent 能「驱动」还需要壳把 WebContents debugger 的
   命令/事件转发给 server（Penguin 用 `utilityProcess` 的消息端口）。
3. **服务端 tab 注册表 + Agent 工具面** —— tabs 的真值在服务端，前端只是窗口；这层做不出来，多窗口/重启就散。

---

## 7. 每个功能的「最小可移植版本」

**§1 chat**

- 流协议状态机：**别搬代码，搬四个决定**：(a) 连上再取历史，事件先缓冲（`buffering → live`）；(b) 每次 load/rebuild 递增 epoch，
  重放循环发现 epoch 变化就交棒；(c) 在流里的 `task_state` 是唯一权威运行态；(d) 审批表用 `origin + toolCallId` 作 key，
  resync 后清空等服务器重发。Adelie 的 `hooks/useAdelie.ts` 已经有「按会话分桶」的雏形，加 epoch 与缓冲表即可。
- 视图模型 reducer：一个 `reduce(items, msg) → items` 的纯函数 + 一张「开/累加/关闭」的片段表；complete 消息**替换**片段内容（保证一致性）。
- 消息项分发 + Markdown：一个 switch 把 item 类型映射到组件；文本走 Markdown（引 `react-markdown` 即可，不要自写）。
- 自动贴底：`stream-follow.ts` 可整份照搬思路（退出看输入事件方向、恢复看距底 80px、第一次滚动按位置初始化）。
- 工具卡耗时：`durationMs = 参数生成段 + 执行段`，审批等待单独标记不计入。Adelie 的 `ToolCard.tsx` 现在只有状态色，加这一行就有。
- 审批：Adelie 已有三态？—— 现在只有「批准/拒绝 + remember」（`ApprovalCard.tsx` 113 行）。最小增量是给会话加
  `approvalMode` 字段 + 输入区一个下拉，服务端在 `always-ask` 之外放行。
- 斜杠命令：一个 `matchSlash(text, caret)` 纯函数（Penguin 的 `slash-token.ts` 只有 42 行，规则是「位置匹配 + 只移除那个 token」），
  先只做 `/compact` 一条。
- 每轮统计行：`run_finished.usage` 已经在 Adelie 的流里，直接画成一行图标 + 值即可；成本要服务端给定价才做。
- 会话列表分页：先加 `?category=&offset=&limit=`，前端按 (类别) 分页，比一次全拉更省。

**§2 dock**

- 一条右侧 dock：`<div>` 固定宽 + 一个 `useState<PanelKind|null>` + 一个「面板种类 → 组件」的 map。
  **先不做拖拽、不做浮动球、不做两条边**。
- 隐藏不卸载：用 `visibility`/`width:0` 而不是条件渲染 —— 这一条是「停靠面板好不好用」的分水岭，成本极低。
- 布局持久化：一个 `localStorage` 键存 `{scope → tabs[]}`，切会话换 scope。
- 面板注册表：`{kind, label, icon, render}` 的表，`+` 菜单从表生成。

**§3 terminal**

- 无原生模块版：服务端 `child_process.spawn` + 管道，WS（或「SSE 读 + POST 写」），前端 xterm + `addon-fit`。
  **放弃** attach/restore 的整屏重绘（不做 pty 重放），改为「终端活到进程死」——刷新页面就丢，这是可接受的降级。
- 帧协议：`[opcode, slot, ...payload]`，输出直接 decode 成 string 交给 xterm（不 JSON parse）。
- 独立页先做：一条 `/terminal` 路由 + 单选活终端，比嵌进 dock 简单得多。
- 触摸键栏：只有 `(pointer: coarse)` 才渲染；Ctrl/Alt 粘滞；`mousedown` 上 `preventDefault()` 保住焦点。

**§4 palette**

- 一个 150 行的组件：受控 `open` + 一个 `actions: {id,label,keywords,run}[]` + 输入过滤 + ↑↓ Enter。
- 键位分发器：`window.addEventListener("keydown")` 一个，按「命令 id → 处理器」的表匹配，命中就 `preventDefault()`；
  另留一张 reserved 清单（浏览器/输入框自己用的键）。
- 挂载点：`extra` 参数是它真正的价值 —— 让页面往面板里塞自己的动作。

**§5 workflows**

- 最小版与 workflow 无关，只有三步：(1) 服务端把一个目录当静态资源托管（`GET /api/artifacts/:id/*`）；
  (2) 前端一个 iframe 挂它，URL 带内容 hash；(3) `postMessage` 或键盘转发给一条「退出」路径。
- 版本回滚：服务端每次写入前把目录快照到 `.versions/<ts>/`，`GET history` / `POST rollback` 就是列目录与复制。

**§6 builtin-browser**

- 只用 Electron 自带能力版（**不做 CDP**）：主窗口 `webviewTag: true`，前端一块 `<webview>` + 自建标签数组 +
  工具栏（`goBack/goForward/reload/loadURL`）+ 地址栏（纯函数规则可整份照搬 `address.ts` 的思路）。
  这就有「人用的浏览器」，但 Agent 不能用它 —— Penguin 自己的最小版建议也是这么写的。
- 页面不进 dock：**这一条必须抄**。`<webview>` 一移动 DOM 就重载，所以把页面放在一个固定层、按坐标盖到面板的 slot 上
  （`geometry.ts` 的思路：裁切框 = 可见部分，内部 view = 全尺寸）。
- 状态：服务端一份 tabs 表 + 窗口一份 guests 表；guests 只追加/删除。
- 导入系统浏览器登录态：**不做**。跨平台解密要钥匙串/DPAPI，没有原生能力时不该尝试。

---

## 附：这次**没有找到**的东西，以及没有读的部分

### 没找到 / 明确不存在

- 六面**没有**自己的样式系统：全部走 Tailwind 类 + UI 包的 token，`web/src/styles.css` 只有 16.7 KB 且与六面无关。
  唯一的例外是终端配色 —— 它必须在 JS 里解析（`terminal-appearance.ts:1`：Tailwind 的 `dark:` 锚在根类上，子树只能 opt in、不能 opt out，
  而「深色 app 里的浅色终端」必须可表达）。
- 命令面板**没有**页面跳转/搜索类动作：注册表里常设只有「harness 历史」一条，其余全靠调用方 `extra` 注入。
  （也就是说：它的定位是「扩展点」，不是「全局跳转器」。）
- dock **没有**任何自动开面板的策略：开哪条边、开哪个面板完全由用户手势决定；唯一的例外是内置浏览器被 Agent 动作唤起一次
  （`builtin-browser.zh.md:23`）。
- workflows **没有**前端执行能力：页面一律 iframe，服务端只做托管与版本，没有把 workflow 的 UI 编译进前端包的机制。
- builtin-browser **没有** Firefox/Safari 路线：整块建立在 Electron `<webview>` + Chromium CDP 上，官方文档直接写「仅桌面应用」。
- chat **没有**富文本编辑器，也没有 emoji/提及/@ 语法：输入是一块 textarea，附件/引用/技能都是 chip 与行内 token。
- 托盘/更新/通知那类**桌面独有**的东西不在本文范围（已由 `penguin-desktop-features.md` 覆盖）。
- **没有** dock / terminal / palette / workflows 的独立文档：`packages/docs/content/` 下只有
  `web-app.zh.md`(224)、`chat.zh.md`(404)、`builtin-browser.zh.md`(155)、`omni-message.zh.md`、`message-flow.zh.md`、`interfaces.zh.md`
  —— 前三个是我核对行为时的用户视角依据（`chat.zh.md` 的「使用侧边面板」一节是 dock 唯一的成文描述）。

### 读了但没逐行读完（老实说）

- `lib/omni/stream-model.ts`（2,197 行）—— 只有头注释；reducer 的具体实现（片段替换、origin 绑定、压缩区间不计入）来自注释描述，**未在代码里核实**。
- `chat-page.tsx`(2,813) / `chat-input.tsx`(2,589) / `workspace-browser.tsx`(2,811) —— 只读头注释 + `:1960-2069`、`:2600-2719` 两个区段 + `grep` 定位。
- `workspace-finder.tsx`(1,438) / `draft-view.tsx`(1,169) / `context-gauge.tsx`(835) / `subagents-view.tsx`(487) / `conversation-outline.tsx`(473) —— 只读头注释。
- `components/layout/sidebar.tsx`(3,140) 与 `project-dialogs.tsx`(1,100) —— **完全没读**（会话列表属本任务边界外，只在 dock 的引用处碰到）。
- `lib/shortcuts/*`（约 1,500 行）—— 只读了 `dispatcher` / `registry` / `reserved` 的用途，没读键位匹配实现。
- `features/chat/stream-selection-menu.tsx`、`memory-view.tsx`、`agent-topology.ts`、`thinking-level.ts`、`model-picker-logic.ts`、`header-stats.ts` 的实现 —— 只读头注释或只用 `grep` 定位。
- **`@prismshadow/penguin-ui`（`packages/ui`）完全没读** —— `DockFrame` / `DockTabs` / `DockPicker` / `CommandPalette` / `ToolCallCard` / `LauncherBall` 的真正绘制方。
  本文所有「界面由 UI 包画」的说法都来自容器文件的注释，**未核实**。
- 服务端 `builtin-browser/*`、`terminal/*`、`workflows/*` 的实现 —— 只读了路由签名，没读 handler。
- `state/company.tsx`(856) 与整个公司/组织模式（`/org/*` 6 个页面）**跳过**（不在这六面里，但 chat-page 与它耦合，读数时绕开了）。
- 前端测试 `packages/web/test/`（多个 `*.test.ts`）与 `packages/web/e2e/`（多个 `*.spec.mjs`）—— **一个字没读**。
  它们大概是补齐本文「行为为什么这样」的最快来源。
- **没有跑过 Penguin 的 web dev server**，也没有做任何运行时验证 —— 本文全部来自静态阅读。
