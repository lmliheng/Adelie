# Web 端对齐（Penguin → Adelie）

> **第一版：** 2026-10-04
> **依据**（三份只读研究，对 `penguin-harness` 的 `packages/web` 做静态阅读得来）：
> - `docs/research/penguin-web-skeleton.md`（整体信息架构与工程做法 + admin/settings/company/machines/messaging/semantic-id）
> - `docs/research/penguin-web-chat-workspace.md`（chat/dock/terminal/palette/workflows/builtin-browser）
> - `docs/research/penguin-web-models-ops.md`（models/usage/traces/agents/skills/plugins/schedules/benchmark/ai-create/harness）
>
> 桌面端那一轮是 `docs/desktop-parity.md`，判据与记法同它：**已具备 / 不适用 / 不做 / 待办**。

## 0. 先摆清两个事实

1. **Adelie 的 web 是一个界面**（17 个组件 / 约 2600 行：会话列表 + 流式对话 + 工具时间线 +
   审批 + 设置 + 登录 + 用户管理）；**Penguin 的 web 是一个产品**（410 个文件 / 6.0 MB / 22 个
   feature 面）。「对齐」不可能是一次性的，这份文档的作用是把它拆成可分批的清单。
2. **Penguin 的骨架不值得照搬**（研究结论）：它的路由、`state/*`（3350 行）、`api/`、共享 UI 包
   全都是为「Project / Agent / Company / 多机」那套语义长的，而 Adelie 现在只有一个平级页面、
   一套自洽的 CSS 变量体系、以及 POST + Bearer 的流（Penguin 用 `EventSource` 是因为它的流是
   GET，换过去反而做不了）。**要借的是三条做法，不是四件实现。**

## 1. 逐面对照（22 个面）

| 面 | Penguin 有什么 | Adelie 现状 | 结论 |
| --- | --- | --- | --- |
| `chat` | 对话主界面：流状态机 + 视图 reducer + 输入卡/斜杠命令/模型弹窗 + 工具时间线 + 成本与统计 + 草稿页（80 文件 / 22,836 行） | 有骨架；差 markdown、斜杠命令、附件、上下文环、成本、大纲、子代理、文件面板、workspace 选择器 | **待办**（分三批：批次 2 / 4 / 5） |
| `dock` | 右侧与底部两条停靠面，**一切侧边元素都是标签**；关面板只收到 0 尺寸（隐藏 ≠ 卸载） | 无（侧栏是写死的一块） | **待办**（批次 2，先做宿主 + 隐藏不卸载） |
| `palette` | 命令面板；本体只有 65 行，价值在「动作 = 命令」的扩展点 + 键位分发器 | 无（5 处散落的 `window.keydown`） | **做**（批次 1） |
| `settings` | 11 页分 Personal / Server 两组，纯函数可见性谓词决定谁看得见 | 单个 `SettingsDialog`（478 行），只管凭证/配置/工具 | **做**（批次 1：rail 分节 + 可见性谓词） |
| `admin` | 用户列表 / 建用户 / 重置口令 / 两步确认删除，`isAdmin && !desktopMode` 才出现 | **已具备且更宽**（`UsersDialog.tsx` 还能改角色）；差「初始口令未改」状态、删用户连带清数据 | **待办**（小，批次 3） |
| `models` | 一个 Project 一张模型表（配对键、整体替换）+ 分组/折叠/拖拽/标记 + 密钥授权 + 余额钉 + 一键同步目录 + 测速/协议/vision 探测 | 只有 `GET /api/models` + `PATCH /api/config` 两个控件 | **待办**（批次 3，服务端要动） |
| `usage` | 三张汇总卡 + 2×2 图（请求/成功率按 Agent 与 Model、token 分桶、成本）+ 错误面板 | 只有每轮三个 token 数（`TurnView.tsx:49`） | **待办** = 重构路线图的 **P4**（批次 4） |
| `traces` | 分片文件 = 一段模型上下文；会话内 dock 面板 + 按 Task 的统计卡/甜甜圈/CUDA 式时间线 + analysis（请求配对、工具耗时、压缩、token 趋势）+ 下载/导入 | 有事件溯源与事件时间线；差分片概念、analysis、download、import | **待办** = 路线图的 **P5**（批次 5） |
| `agents` | 列表 + 九 tab 设置页（指令/运行时/工具+MCP/技能/钩子/记忆/保险库/定时）+ State 快照导出导入 | **没有 Agent 实体** | **待办**（远期，要先有 Agent 概念） |
| `schedules` | 声明文件 = 意图、运行态入库、**不补跑**、忙时排队一份；两个入口一套表单 | 无（也没有定时任务概念） | **待办**（批次 6；语义比代码值钱） |
| `skills` | 多选面板与图标（311 行），库在插件面、Agent 侧在设置 tab | 无 | **待办**（依附于 `agents`/`plugins`） |
| `plugins` | 库/详情/索引页 + 上传与 URL 两条导入 + 安装到 Agent + Project 级 `[plugins]` 表（admin-only） | 无 | **待办**（远期，要插件运行时） |
| `benchmark` | 评测中心卡片 + 详情折线/评测表/案例浏览器；数据就是 `benchmark_config.toml` + `scoreboard.yaml`，服务端不重算 | 无 | **不做**（Adelie 没有评测活动；等有 benchmark 再说） |
| `ai-create` | 不是页面而是一条管道：把提示写进**新会话草稿**、**绝不自动发送**，被五处引用 | 无 | **做**（很便宜，批次 3） |
| `semantic-id` | 一个输入框 + 提示函数（254 行），5 个创建对话框共用 | 暂无宿主 | **不做**（等 Adelie 有「创建实体」的对话框再搬，那时它自然有第一个用户） |
| `terminal` | xterm 面 + 二进制帧 + 独立页深链 + 触摸键栏 | 无；Adelie 现在只有「一轮一条 SSE」 | **不做**（要有 pty/原生模块，见 `docs/desktop-parity.md` §3 同类判断） |
| `builtin-browser` | 内置浏览器面板 + 页面宿主 + Agent 驱动的 tab 注册表 | 无 | **不做**（`<webview>` 仅桌面可用，且桌面那轮已判「等于换产品」） |
| `workflows` | 工作流标签 + iframe 帧 + 版本回滚；面向「Agent 自写 UI」 | 无，且前置件全缺（无 skills/agents/workflow 概念） | **不做**（属于另一条产品线） |
| `harness` | 热更新历史覆盖层 + 模块树 + 回滚 + 自更新 | 无（也没有 HMR 底座） | **不做**（研究结论：不该抄） |
| `company` | 工作模式开关 + 6 页（overview/chart/calendar/tickets/finance/handbook）+ 频道 + 工单（53 文件 / 17,083 行 / 36 个端点） | 完全没有 | **不做**（一整套领域与服务端，与 Adelie 的定位无关） |
| `machines` | 舰队卡片、启用/停用、ssh 主机表单、6 段步进器 | 无；Adelie 服务端绑回环单机、没有机器概念 | **不做** |
| `messaging` | dock 面板 + 会话行对话框共用编辑器，4 通道，QQ/微信扫码接入 | 无 messaging 路由、无 dock 层 | **不做**（要做也是先做 dock，再看通道） |

## 2. 骨架：借三条做法，不搬四件实现

| 借 | 为什么 | 落在哪 |
| --- | --- | --- |
| **纯函数的可见性谓词** | Penguin 用 `lib/settings-sections.ts:58-114` 一组纯函数决定「这一节谁看得见」；Adelie 现在是散在 JSX 里的 `{isAdmin && …}`，加一节就要改一处判断 | 新增 `packages/web/src/lib/sections.ts`，单测 |
| **命令 id → 处理器 的单一键位分发器** | Penguin 先有分发器 + reserved 键清单，命令面板才有东西可列；Adelie 现在 5 处原生监听各写各的（`App.tsx:112`、`SettingsDialog.tsx:126`、`UsersDialog.tsx:52`…） | 新增 `packages/web/src/lib/shortcuts.ts`，单测 |
| **dock 的「隐藏 ≠ 卸载」** | 关面板只收到 0 尺寸而不是从树上摘掉 —— 滚动位置、下钻、未保存的编辑都留着；只有「一个标签都不剩」才卸载 | 批次 2 |

| 不搬 | 为什么 |
| --- | --- |
| `router.tsx` | Adelie 现在只有一个平级页面，加一层路由是负收益；等「模型页 / 用量页」真的有了再上 |
| `state/*`（3350 行） | 全是 Penguin 的 Project / Agent / Company 语义，Adelie 没有那些实体 |
| 共享 UI 包 `@prismshadow/penguin-ui` | Adelie 的 1753 行 CSS 变量体系自洽（手写 CSS + token，见 `packages/web/README.md`） |
| `api/` 层 | Penguin 用 `EventSource` 是因为它的流是 GET；Adelie 是 POST + Bearer，换过去做不了 |

顺带一条**真实缺陷**（研究里发现的）：`packages/web` 装了 `tailwindcss` 但 `vite.config.ts` 没挂插件、
`global.css` 也没有 `@import "tailwindcss"` —— 依赖白装。要么接上，要么删掉。

## 3. 分批计划

| 批 | 内容 | 验收 |
| --- | --- | --- |
| ~~**1**~~ ✅ | 键位分发器 + 命令表 + 命令面板（`⌘K`/`Ctrl+K`）；设置从「一个长对话框」改成 rail 分节 + 纯函数可见性谓词 | **2026-10-04 完成**：单测 22 条（`shortcuts.test.ts` 18 + `sections.test.ts` 4）；真浏览器验收 13 项全过（Ctrl+K 出面板 → 输入过滤 → ↑↓ + 回车执行；输入框里敲裸字符不弹面板；rail 四节 + 个人/服务端两组 + 用户节真拉 `/api/users`；窄屏 rail 横向；console 无 error）。见下「批次 1 落地」。 |
| **2** | dock 宿主（右侧面板区 + 面板注册表 + 布局持久化）+ 隐藏不卸载；把现有侧栏/时间线搬进去 | 开关面板不丢滚动位置与未保存输入 |
| **3** | `admin` 的补齐（初始口令未改状态、删用户连带清数据）+ `models` 页 + `ai-create` 管道 | 需要 `docs/api.md` 先加路由 |
| **4** | **= 路线图 P4**：用量落库与成本（「只落 token、成本现算」+ 价格表 + `/api/usage` + 用量页） | 单测 + 真数据跑一轮 |
| **5** | **= 路线图 P5**：trace 分片与分析（含 `trace-refresh` 那类「什么时候重取」的纯函数） | 同上 |
| **6** | `schedules`（文件=意图、运行态入库、不补跑、忙时排队一份）与 `agents` 实体 | 远期 |

**建议顺序**就是表里的顺序：1 → 2 是纯前端、看得见；4 → 5 是 Adelie 自己路线图上的 P4/P5，
做它们等于「用 Penguin 的答案做自己的欠账」；3 与 6 依赖服务端与实体，往后排。

## 4. 这份对照没覆盖的

- 三份研究都是**静态阅读**，没有启动过 Penguin 的服务，也没有跑过它的前端。
- `@prismshadow/penguin-ui` 一个字没读 —— 所有「界面由 UI 包画」的说法都来自容器注释，未核实。
- 每份研究文末的「没有找到 / 没有读的部分」逐条列了跳过的文件，接手时先看那一段。

## 5. 批次 1 落地（2026-10-04）

| 文件 | 是什么 |
| --- | --- |
| `packages/web/src/lib/shortcuts.ts` | 键位规格解析（`"mod+k"`）、事件归一、`isTypingTarget`、命令表类型、`resolveShortcut`、`filterCommands`（前缀 > 词首 > 包含 > 子序列）。**没有 DOM 依赖**，所以跑在 node 环境的单测里 |
| `packages/web/src/lib/sections.ts` | `SETTINGS_SECTIONS` + `isSectionVisible` / `visibleSections` / `firstVisibleSection` / `resolveSection` |
| `packages/web/src/components/CommandPalette.tsx` | 面板本体（输入、过滤、↑↓、Enter、Esc、点击）；键位处理在输入框自己的 `onKeyDown` 里并 `stopPropagation` |
| `packages/web/src/components/UsersPanel.tsx` | 原 `UsersDialog` 去掉对话框外壳，变成设置里的一节（逻辑没改，`open` → `active`） |
| `packages/web/src/components/SettingsDialog.tsx` | 加 `section` / `onSectionChange` / `isAdmin`；左侧 rail 两组，右侧按节渲染（三个节是**本地渲染函数**，不是组件 —— 切节不丢刚填一半的表单） |
| `packages/web/src/App.tsx` | **唯一**一份命令表和**唯一**一个 `window.keydown` 分发器；`settingsSection` 状态；`openUsers` 改成「打开设置的 users 节」 |
| `packages/web/src/styles/global.css` | `.settings-body` / `.settings-rail` / `.rail-item` / `.dialog.is-wide` / `.palette*` / `.kbd` |

三条取舍：

1. **命令表只有一份**：面板里列的、快捷键按的、将来别处要用的是同一批 `ShortcutCommand` 对象。
   命令按「当前条件下真的可用」进出表，而不是进去以后灰掉。
2. **输入框里不触发裸键**：`resolveShortcut` 在 typing target 上放行带 `mod`/`alt` 的键位与非可
   打印键（Esc/方向键），裸字符不放行 —— 否则在输入框里打一个字母就把面板打开了。
3. **没给「新建会话」等命令配键位**：浏览器把 `Ctrl+N` / `Ctrl+Shift+N` 这一类占死了，配了也
   按不出来（只有 Electron 壳里能拦）。它们留在面板里可选，比显示一个按不动的键位诚实。

验收（命令与结果）：

```bash
pnpm --filter adelie-web typecheck && pnpm --filter adelie-web test && pnpm --filter adelie-web build
node scripts/audit.mjs --with-e2e          # 端到端冒烟 + 全套门禁
# 真浏览器验收（13 项）见部署一节，脚本按需重写：Playwright 走登录页填 token → 主界面
```

## 6. 部署（4000 端口，2026-10-04）

```bash
systemctl status adelie-web.service      # /etc/systemd/system/adelie-web.service
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/            # 200（静态外壳）
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/api/config  # 401（没带 token）
```

- 监听 `0.0.0.0:4000`；**要求 token**（`/etc/adelie/web.env`，0600，单元用 `EnvironmentFile` 读，
  不写进单元本身）。持有 token 的请求按**主机身份**（管理员）处理。
- 工作区默认取进程 cwd，所以 `WorkingDirectory=/root/adelie-workspace`（空目录）；管理员可在
  「设置 → 运行配置」里改。
- `ADELIE_WEB_DIST` 指向仓库里的 `packages/web/dist`：**重建 web 产物即生效，不用重启服务**
  （改服务端才 `systemctl restart adelie-web`）。
- `ufw allow 4000/tcp`（与 3004 同一条先例，Anywhere）；`/root/egress-whitelist/config.json`
  的 `managedPorts` 与 `services` 已登记 4000 —— 那份配置是**进程启动时读一次**的，
  运维面板要重启后才显示这一条（端口与规则本身已经生效）。

**已知坑**：配了 `ADELIE_TOKEN` 之后连 `/api/health` 也要 token（token 中间件在路由权限表
之前），所以「未登录探活」只在没设 token 时成立。另外服务端打印的带 token 地址在浏览器里
**不直接可用** —— 前端不读 `?token=`，见 `docs/issues/web-token-url-not-consumed.md`。

## 7. 用户追加的要求：左 rail + 输入区（2026-10-04）

用户原话：「左边可以设置项目，智能体，模型，插件，成本中心。对话框下面，可以传图片，文件，设置权限，
加技能，上下文占用，设置思考等级，模型切换。内容很多，你可以慢慢改，在 issue 里提出设计，再优化。
你放开手做就行。」

设计都写进了草稿（一条一个面，含最小版与依赖）：

| 要求 | 设计在哪 | 与 §3 六批次的关系 |
| --- | --- | --- |
| 左 rail：项目 / 智能体 / 模型 / 插件 / 成本中心 | `docs/issues/web-left-rail-navigation.md` | 把原批次 3 与批次 6 的入口部分合起来，并**提到最前面**；要引入 router（§2 里「不搬 router」的前提「只有一个平级页面」不再成立） |
| 项目实体 + 智能体实体 | 同上（二期） | 原批次 6，现为二期的全部内容 |
| 模型页 | `docs/issues/web-models-page.md` | = 原批次 3 的 models 页，独立成条 |
| 成本中心 | `docs/issues/web-usage-cost-center.md` | = 原批次 4（路线图 P4） |
| 插件 | `docs/issues/web-left-rail-navigation.md` | 原批次 6，仍是远期（要 skills / hooks 运行时） |
| 输入区控件带（附件 / 权限 / 技能 / 上下文 / 思考等级 / 模型） | `docs/issues/web-composer-toolbar.md` | 新开；六件按「依赖现有接口与否」分三期 |
| 移动端适配 | `docs/issues/web-mobile-layout.md` | 新开；顶栏那条**已修**（文档见该草稿），其余与输入区一起做 |

**修订后的优先顺序**（覆盖 §3 的建议顺序）：

1. 导航空壳（纯前端、看得见）—— 后面每个功能都要有地方放，先有壳再加肉。
2. 移动端剩余排布 + 输入区一期（模型切换 + 权限：两者都只用现有接口）。
3. 成本中心（= P4）—— 顺带把上下文环要的「会话级 token 累计」一起做了。
4. 项目与智能体实体（要动服务端与契约）。
5. 模型页、附件、技能、思考等级（思考等级要先拍板语义）。
6. 插件（远期）。

> 批次 2（dock 宿主）与批次 5（trace）仍在表上，但**排在上面的 1–3 之后**：
> dock 是「面板往哪放」的机制，而用户现在要的是 rail（页面往哪放）—— 两者不冲突，
> 先做 rail 能让 dock 的宿主机位更清楚（右侧面板要有个页面可依）。
