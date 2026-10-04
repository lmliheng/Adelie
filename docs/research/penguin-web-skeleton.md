# Penguin Web 端：骨架体系与 6 个功能面（只读研究）

> **研究日期：** 2026-10-04
> **依据版本：** `@prismshadow/penguin-web` `package.json` version `0.2.13`（`packages/web/package.json:3`）；
> react `^19.1.0`、react-router `^8.3.0`、zustand `^5.0.15`、Tailwind `^4.1.0`、vite `^7.0.0`（`package.json:15-43`）
> **读了什么（只读，未改动任何文件）：**
> - 骨架：`packages/web/src/{router.tsx,app.tsx,main.tsx,module.json,styles.css}`、`lib/pages.ts`、`lib/settings-sections.ts`、`lib/nav-group-collapse.ts`、`lib/account-menu.ts`、`lib/server-context.ts`、`api/{client.ts,sse.ts}`、`state/{auth.tsx,project.tsx,company.tsx,sessions.tsx,theme.tsx,locale.tsx}`（后四个只读文件头注释）、`pages/`、`components/layout/app-layout.tsx`（头 120 行）、`index.html`、`vite.config.ts`、`package.json`、`public/`、`scripts/`
> - 托管：`packages/server/src/{app.ts:660-720,config.ts:125-132,index.ts:371-376}`
> - 6 个 feature 面：`features/{admin,settings,company,machines,messaging,semantic-id}` 的文件清单 + 代表性文件深读（见每节「读了哪几个」）
> - Adelie 侧：`packages/web/src` 全量文件清单、`App.tsx`、`api/client.ts`、`main.tsx`、`lib/theme.ts`、`register-sw.ts`、`vite.config.ts`、`index.html`、`public/`、`components/{Sidebar,SettingsDialog}.tsx` 头、`hooks/{useAdelie,useAuth}.ts` 头、`styles/global.css` 头、`docs/api.md`、`docs/desktop-parity.md` 头、`docs/redesign.md` 头
>
> **判据：** 每条结论后面括号里是 `文件:行`（已用 `grep -n` / `sed -n` 核对），或一条可复跑的 `grep` 命令。
> 只读到文件头/注释的，文中会写明「仅读文件头」；**没读或没核实的，写「未核实」**。

---

## 第一节：整体信息架构与工程做法

### 1.1 路由表

用 `react-router` v8 的**声明式**写法（`<BrowserRouter>` + `<Routes>`，`router.tsx:11`）。两种装载方式：
常规走地址栏（`BrowserRouter`）；被宿主文档 iframe 时传 `initialPath`，改用 `MemoryRouter` 且不碰宿主 URL —— 这是这套应用「能被别处装载」的唯一接缝（`router.tsx:6-10`、`router.tsx:160-164`）。

完整路由表（`router.tsx:104-158`）：

| 路径 | 元素 | 门/外壳 | 位置 |
| --- | --- | --- | --- |
| `/login` | `LoginRoute` → `LoginPage`；已登录则跳 `/chat` | 公开 | `router.tsx:97-101,106` |
| `/terminal` | `TerminalPage` | `RequireAuthBare`（无侧栏、无 Project 上下文的全窗面） | `router.tsx:89-94,107-114` |
| `/app/:projectId/:agentId/:workflowId(/:tabKey)` | `WorkflowAppPage` | `RequireAuthBare` | `router.tsx:117-129` |
| `/` (index) | → redirect `/chat` | `RequireAuth` | `router.tsx:131` |
| `PAGES.map(...)` | 由 `module.json` 逐条生成（下表） | `RequireAuth` | `router.tsx:135-137` |
| `/org` | `OrgIndexRedirect` | `RequireAuth` | `router.tsx:142` |
| `/org/:projectId/:orgId` + `overview`/`chart`/`calendar`/`tickets`/`finance`/`handbook`/`channels/:channelId` | `OrgLayout` + 各页；`*` → `overview` | `RequireAuth` | `router.tsx:143-153` |
| `*` | → redirect `/chat` | `RequireAuth` | `router.tsx:156` |

`RequireAuth` 的守卫语义：`user === undefined`（`GET /api/me` 初始化中）渲染 `null`；`user === null` 跳 `/login`；否则套 `ProjectProvider > SessionsProvider > CompanyProvider > AppLayout`（`router.tsx:69-82`）。`RequireAuthBare` 是它的无壳版（`router.tsx:89-94`）。
注意 `settings` / 用户管理**已不是路由**：注释明说它们迁进了 Settings 对话框，旧路由落进 catch-all（`router.tsx:154-156`）。

`module.json` 贡献的 10 个页面（`module.json:7-118`，字段 `id/key/path/nav/admin/released/renderer`）：

| path | nav | admin | renderer.builtin |
| --- | --- | --- | --- |
| `/chat/:sessionId?` | none | 否 | ChatPage |
| `/agents` | main | 否 | AgentsPage |
| `/agents/:agentId` | none | 否 | AgentSettingsPage |
| `/models` | main | 否 | ModelsPage |
| `/plugins` | main | 否 | PluginsPage |
| `/plugins/registry/*` | none | 否 | PluginDetailPage |
| `/machines` | main | **是** | MachinesPage |
| `/usage` | main | 否 | UsagePage |
| `/benchmark` | main | 否 | BenchmarkPage |
| `/benchmark/:benchmarkId` | none | 否 | BenchmarkDetailPage |

### 1.2 一个 feature 面怎么挂上去（三种挂法 + 一台注册表）

**挂法 A：页面（manifest 驱动）。** 页面 = `module.json` 一条 JSON + `BUILTIN_PAGES` 注册表一行：

1. `module.json.contributes["web.pages"]` 是源码（`module.json:7-118`），`lib/pages.ts:11,24` 直接 `import manifest` 取用。
2. renderer 两种：`{builtin: "XxxPage"}` 到 `BUILTIN_PAGES`（`router.tsx:45-56`）查组件，查不到 → `<Navigate to="/chat">`；`{iframe:{src,namespace}}` 直接渲 `iframe`（`router.tsx:58-66`）。
3. 侧栏导航从同一份 manifest 派生：`NAV_PAGE_KEYS`（`lib/pages.ts:27-29`）、`navPagesFor(isAdmin)`（`lib/pages.ts:32-34`）；折叠/固定/未发布的状态机在 `lib/nav-group-collapse.ts:30-60`（`NAV_GROUP_KEYS`、`ADMIN_ONLY_NAV_KEYS`、`UNRELEASED_NAV_KEYS`）。
4. **远端页面的接缝已定义但还没人用**：`mergePages()`（`lib/pages.ts:40-66`）把服务端 `GET /api/contributions` 来的页面并进来，本 build 渲染不了的（builtin 不在注册表）跳过。**全仓只有 `packages/web/test/pages.test.ts` 调用它，`src/` 里没有任何一处用上它**（`grep -rn "mergePages" packages` 结果仅 `lib/pages.ts` 与 `test/pages.test.ts`；`grep -rn "api/contributions" src` 只命中注释 `lib/pages.ts:7`）。

**挂法 B：对话框/设置页。** `SettingsDialog` 由 `components/layout/user-menu.tsx:152` 挂载（`import` 在 `:33`）；用户管理是它的一页 `AdminUsersSection`（`features/settings/settings-dialog.tsx:31,162`）。`features/settings/settings-request.ts:24-42` 是一个「从别处请求打开设置」的极简总线（一个 listener + 一个 pending）。

**挂法 C：停靠面板（dock）。** `features/dock/dock-state.ts:49,56` 定义面板键（`"agents" | "workspace" | "memory" | "trace" | "messaging" | "schedules" | "builtin-browser"`），`dock-panel.tsx:120` 与 `panel-meta.tsx:23-24,43` 出标题/图标。messaging 面板从 `features/chat/chat-page.tsx:2058` 挂上。

**权限门是「两端各判一次」**：`admin` 字段只让侧栏不画那一行，路由照旧注册（`router.tsx:132-134` 与 `lib/settings-sections.ts:17-22`）；真正的边界在服务端 403。`lib/account-menu.ts:30-31` 的 `isDesktopShellWindow = desktopMode && sessionVia === "desktop"` 是一个纯谓词，界面与服务端共用同一对字段。

**没有懒加载**：`router.tsx:11-39` 全是静态 import，无 `React.lazy`（唯一被 code-split 的是高亮 worker，见 1.6）。

### 1.3 状态怎么组织

两层：

**顶层单例用 React Context**，Provider 组合在 `app.tsx:46-63`：
`ClipboardWriterProvider > CodeHighlighterProvider > LocaleProvider > ThemeProvider > AuthProvider > LocaleScope > AppRouter`，再挂 `Toaster`、`TooltipLayer`。
路由级再叠 `ProjectProvider > SessionsProvider > CompanyProvider`（`router.tsx:74-80`）。

**域状态用 zustand vanilla store，一个 Provider 挂载一份实例**（`state/project.tsx:8-10` 的文件头即写明这个约定）：
- `createStore<...>(...))` 定义在组件外（`state/project.tsx:73-138`），Provider 里 `useState(createProjectStore)` 保证卸载即重置，`useStore(store)` 订阅，再用 `useMemo` 出版成 context value（`state/project.tsx:159-192`）。
- 同样形状见于 `state/sessions.tsx`（头注释 `:30-40`，文件 75 KB）、`state/company.tsx`（头注释 `:55-62`，38 KB）。全仓共 10 个文件 import zustand（`grep -rl zustand src | wc -l` → 10，含 `components/layout/sidebar.tsx`）。
- `state/auth.tsx` 是纯 Context：`user: undefined`=初始化中 / `null`=未登录（`state/auth.tsx:96`），并注册全局 401 处理器（`:111-114`），窗口回到前台时用 `probeSession()` 收敛突发 focus（`:139-157`）。
- 持久化两类：`localStorage`（`penguin.lastProjectId`，`state/project.tsx:19`；主题/语言键由共享包定义）+ 服务端 prefs 尽力而为（`state/project.tsx:116`）。主题见 `state/theme.tsx:1-24` 与 `index.html:22` 的首绘脚本。

### 1.4 请求层怎么写的

- 唯一入口 `api/client.ts`。`apiFetch` / `apiFetchWithMeta`（`:78-83`）：`credentials: "same-origin"`（`:104`）、JSON 体自动序列化、非 2xx 统一解析服务端 `{error:{code,message}}` 体并抛 `ApiError(status, code, message)`（`ApiError` 定义 `:15-28`）。
- `setUnauthorizedHandler`（`:32`）让任何非 `/api/auth/*` 的 401 触发登出；跨机器的 401 不算（`:145-153`，注释解释了「点远程主机会把本机登出」这个 bug）。
- **多机路由**：`lib/server-context.ts:23-26` 的 `apiUrl(path, machineId)` 把路径重写成 `/server/<machineId>/api/…`，`client.ts:89` 默认用 `machineForPath(path)` 决定目标；注释里写着「故意没有全窗口 active server 模式」（`server-context.ts:9-15`）。
- `api/endpoints.ts` **2403 行 / 453 个成员**（`wc -l`、`grep -c`），是全部端点的一处收口；返回类型 import 自服务端包 `@prismshadow/penguin-server/api`（如 `state/auth.tsx:9`、`api/sse.ts:15`）。**「它是否由脚本生成」未核实**（未找到生成器）。
- **SSE 用 `EventSource`**（`api/sse.ts:43-71`）：默认事件 = OmniMessage、具名事件 `server_event`；靠同源 cookie 鉴权，断线由浏览器自愈并带 `Last-Event-ID`，服务端从环形缓冲重放，淘汰了就推 `resync_required`（`:1-12`）。
- `lib/` 共 70 个文件，是「全部客户端逻辑」的堆场（示例：`install-scope.ts` 24 KB、`session-grouping.ts` 29 KB、`strings.ts` 314 KB）。

### 1.5 样式体系

- **Tailwind CSS 4 + 一个共享 UI 包**。入口只有 `src/styles.css`（492 行，`main.tsx:33` import）：`@import "tailwindcss"` + `@import "@prismshadow/penguin-ui/theme.css"` + 三套主题 `themes/{github,modern,geek}.css` + `fonts.css`（`styles.css:17-22`），`@source "../../ui/src"` 让 Tailwind 扫到共享包的类名（`:26-27`），品牌色阶用 `@theme` 定义（`:30-43`）。
- 视觉语言写在文件头：实底 + 1px 边框 + 单一品牌蓝，无玻璃态/渐变；深色由 `html.dark` 切换（`styles.css:1-9`）。token→utility 的桥、基础规则、主题取值都在共享包 `@prismshadow/penguin-ui`（本报告**没有读该包**，只从 import 推断）。
- 首绘不闪：`index.html:22` 有一段内联脚本，在首帧前把 `html.dark`/`data-theme`/`data-accent`/根字号按 localStorage 设好，注释要求它与共享包的 `BOOT_SCRIPT` **逐字节相同**（有测试比对）。
- 没有 CSS Modules、没有 CSS-in-JS。

### 1.6 构建产物怎么部署

- scripts：`dev`/`build`(`vite build`)/`preview`/`typecheck`/`test`(`vitest`)/`test:e2e`(`bash e2e/run.sh`)（`package.json:7-14`）。
- dev：vite 监听 **7365**，`/api` 代理到**开发**后端 `127.0.0.1:7368`（不是安装版的 7364），`ws: true` 给终端升级用（`vite.config.ts:84-97`）；目标可被 `PORT` / `PENGUIN_API_PROXY` 改，`apiProxyTarget()` 是纯函数且有单测（`:34-36`）。
- 构建细节：`worker.format="es"`（高亮 worker 要 code-split，`:80-83`）；字体不内联（`assetsInlineLimit` 对 `.woff2` 返回 `false`，`:74-79`）；一个插件把 KaTeX 样式里的 woff/ttf 源删掉，省 40 个字体文件（`:38-70`）；`penguinUi()` 顺带输出字体许可文本（`:11-13`）。
- 托管：服务端有一个极简静态服务 + **SPA 回落** + 路径穿越防护（`packages/server/src/app.ts:669-710`），且能服务「内存里的 dist」（热更新主机推的）或磁盘目录；`webDist` 的解析顺序是 `PENGUIN_WEB_DIST` → 包内 `web-dist/` → `../web/dist`（`config.ts:125-132`）；启动时打印 web dist，缺 `index.html` 直接报错（`index.ts:371-376`）。
- **没有 PWA**：`packages/web` 里没有 service worker、没有 `manifest.webmanifest`（`grep -rn "serviceWorker|manifest.webmanifest|registerSW" src` 无命中）；`public/` 只有 `penguin-logo.svg` 与 `workflow-ui.css`。Penguin web 不可安装。

### 1.7 骨架规模（供 Adelie 对照）

| | 文件数 | 行/体积 |
| --- | --- | --- |
| `src/state/*` | 9 | 3350 行 |
| `src/lib/*` | 70 | 含 `strings.ts` 314 KB / `strings-en.ts` 300 KB |
| `src/features/*` | 22 个目录 | 合计约 8.5 万行（最大的 `chat` 80 文件 22836 行、`company` 53 文件 17083 行） |
| `src/api/endpoints.ts` | 1 | 2403 行 / 453 成员 |
| `src/styles.css` | 1 | 492 行 |
| 共享 UI 包 `packages/ui` | 未读 | — |

（features 行数为 `find … | wc -l` 与 `cat *.ts *.tsx … | wc -l` 实测。）

---

## 第二节：6 个 feature 面

### 2.1 `admin` —— 用户管理（管理员）

> 读了：`features/admin/admin-users-page.tsx`（364 行，全读）。该目录只有 1 个文件。

| 能力 | 用户看到什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 用户列表 | 表格：`userId`（昵称在下面一行）、角色 Badge、创建时间、「初始密码未改」Badge | `admin-users-page.tsx:56-108` | `api.adminListUsers` | 中 |
| 建用户 | 对话框：用户名 + 初始密码，前端按 `USERNAME_PATTERN` 预校验，按错误码把消息分流到「用户名」或「密码」 | `:132-233`（提交 `:154-180`） | `api.adminCreateUser`、`lib/semantic-id.ts` | 中 |
| 重置密码 | 对话框，只填新密码 | `:235-299` | `api.adminResetPassword` | 低 |
| 删除用户 | 两步确认（第一次点「删除」变成「确认」），提示会一并删掉其 Project 与数据目录 | `:301-363` | `api.adminDeleteUser` | 中 |
| 可见性 | 作为设置对话框的一页；`isAdmin && !desktopMode` 才出现在 rail；被硬闯时 `return null` | `settings-sections.ts:81`、`settings-dialog.tsx:162`、`admin-users-page.tsx:43` | `useAuth` | 低 |

**Adelie 现状：** *已具备，且能力更宽。* `components/UsersDialog.tsx`（223 行，由 `App.tsx:319` 挂载、`TopBar` 的 `onOpenUsers` 打开）+ `api.{listUsers,createUser,deleteUser,setUserPassword,setUserRole}`（`packages/web/src/api/client.ts:163-184`）。Adelie 多了 `setUserRole`（改角色），Penguin 的管理面**没有**改角色。
**差什么：**（a）Penguin 的入口是设置 rail 里的一页，Adelie 是顶栏弹出的独立对话框（形态差异，不是缺失）；（b）Penguin 有 `passwordIsInitial`「初始密码未改」Badge，Adelie 的 `UserInfo`（`packages/web/src/api/types.ts:66-74`）只有 `id/name/isAdmin/hasPassword/createdAt/isSelf/sessionCount`，缺「初始口令待改」这一状态；（c）Penguin 删用户会带走其 Project 与数据目录，Adelie 删用户只清令牌与会话索引（`docs/api.md:80`）。

### 2.2 `settings` —— 设置对话框（11 页 + 两档可见性）

> 读了：`settings-dialog.tsx`（165 行，全读）、`settings-request.ts`（全读）、`lib/settings-sections.ts`（全读）、`appearance-section.tsx` 头 60 行、`general-section.tsx` 头 50 行、`proxy-section.tsx` 头 55 行、`company-section.tsx` 头 45 行。其余 9 个 section 只列名。

| 能力 | 用户看到什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 对话框骨架 | 左侧 rail 分组（Personal / Server），右侧 ChatGPT 式页；`PagedDialog` 承载 | `settings-dialog.tsx:65-164` | `@prismshadow/penguin-ui` 的 `PagedDialog`/`ICONS` | 中 |
| 11 页 | profile / general / appearance / shortcuts / account / credits / proxy / uploads / company / plugins / users | `settings-dialog.tsx:99-163` | 各 section 文件 | 高 |
| 可见性谓词 | 纯函数表 `SECTION_RULES`：不可见的页**整条不出现**（不置灰）；`resolveSettingsSection` 把越权页回退到第一页可开页 | `lib/settings-sections.ts:58-114` | `offersChangePassword`（`lib/account-menu.ts:53-55`） | 中 |
| 两类持久化 | 即时生效的偏好（主题/语言/通知，localStorage 或 `api.putPrefs`）；服务端全局（proxy/company/uploads/plugins，`api.adminPutSettings`） | `general-section.tsx:1-8`、`appearance-section.tsx:1-9`、`proxy-section.tsx:1-18`、`company-section.tsx:1-8` | `api.adminPutSettings` / `api.putPrefs` / `api.updateProfile` | 中 |
| 快捷键录制 | 快捷键页有录制器、冲突表、分发器 | `features/settings/{shortcuts-section,shortcut-recorder,shortcut-runtime}.tsx`、`lib/shortcuts/*`（15 文件） | 自有 `lib/shortcuts` | 高 |
| 插件配置页 | 插件声明的选项由服务端给，页里跑插件动作 | `plugins-section.tsx`、`api.admin{Get,Put}PluginConfig`、`adminRunPluginConfigAction` | 插件系统 | 高 |
| 设置入口总线 | 别处能请求打开设置并指定页，早于挂载的请求会被留住 | `settings-request.ts:24-42` | 无 | 低 |

**Adelie 现状：** *部分具备，形态不同。* `components/SettingsDialog.tsx`（478 行）把**凭证（服务端地址/token）+ 配置 + 工具清单**放在一个对话框里；主题切换是顶栏一个按钮（`hooks/useTheme.ts` + `lib/theme.ts`），不在设置里。
**差什么：**（a）**没有「个人偏好 vs 服务端全局」的分组与可见性谓词** —— Adelie 的配置权限判定在 `lib/permissions.ts`（仅按 `admin_required` 字段置灰），不是一张可测的页表；（b）**没有快捷键体系**（Penguin `lib/shortcuts/` 15 个文件；Adelie 无）；（c）主题/强调色/字号/字体缺成组的设置页（`docs/redesign.md` 的视觉部分未提）；（d）没有插件页、代理页、上传限制页 —— 这些由 Adelie 服务端**没有对应设施**决定（`docs/api.md` §2 只有 `config`/`models`/`tools`）；（e）没有 `settings-request` 这样的入口总线：Adelie 的开关状态在 `App.tsx` 里，任何新入口都得穿 props。

### 2.3 `company` —— 公司模式（最大的一个面）

> 读了：`org-layout.tsx`（319 行，全读）、`company-nav.ts`（全读）、`overview-page.tsx` 头 60 行、`state/company.tsx` 头 70 行、文件清单。余下 50 个文件只按文件名分类。

| 能力 | 用户看到什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 工作模式开关 | 侧栏可在「开发 / 公司」间切；公司模式是 beta，首次进入弹一次提示 | `state/company.tsx:1-70`、`company-beta.tsx` | `MeResponse.companyMode` × `UiPrefs.companyMode` 两个开关相与 | 高 |
| 组织落地页 | `/org` 无组织时是空落地页（一个「创建」+ 三张使命卡）；有组织则开该组织的 overview | `org-layout.tsx:81-186` | `useCompany`、`org-dialogs.tsx` | 中 |
| 组织外壳 | 路由参数解析、项目跟随、当前组织记住、工单对话框**只在这一处挂** | `org-layout.tsx:226-271` | `Outlet`、`TicketDialogHost` | 高 |
| 6 个页面 | overview（KPI/收件箱/时间线/预算告警）、org chart、calendar、tickets（看板，可拖）、finance（预算仪表）、handbook（文件浏览） | `features/company/{overview,org-chart,calendar,tickets,finance,handbook}-page.tsx` | 36 个 `api.*` org 端点 | 高 |
| 频道 | 侧栏自己的频道列表（不是 nav 行）；频道聊天含 mention / notice / markdown / 流 | `channel-*.tsx`（12 文件）、`company-nav.ts:66-69` | `api.*OrgChannel*` | 高 |
| 工单 | 看板 + 详情对话框 + 父子跳转栈 + 阻塞/推进 | `ticket-*.ts*`（6 文件） | `api.*OrgTicket*` | 高 |
| 员工 / 办公桌 | 雇佣、续期、desk session、临时 session 分组 | `employee-dialogs.tsx`、`desk-*.ts`、`org-session-groups.tsx` | `api.hireOrgEmployee`、`renewOrgDesk` | 高 |
| 组织树/财务/手册 | 纯模型 + 页面：`org-chart-tree.ts`、`finance-tree.ts`、`handbook-tree.ts`、`ticket-board.ts`、`calendar-geom.ts` | 同目录 | 无 | 中 |

规模：**53 个文件 / 17083 行**；`state/company.tsx` 38 KB；调用 **36 个** org 相关 API（`grep -rhoE "api\.[a-zA-Z]+" features/company | sort -u`）。

**Adelie 现状：** **完全没有。** `docs/api.md`（240 行）里没有任何 organization / channel / ticket / finance / calendar / handbook 路由；`packages/web/src` 无对应组件；Adelie 也没有「会话之外的领域实体」这一层（`docs/redesign.md` §1 的 v0.2 目标是 Agent 实体，未含组织）。
**差什么：** 差的不是几个页面，而是**一整套领域与它的服务端**：组织/员工/频道/工单/财务/手册的存储与路由、事件流上的 company 事件族（`state/company.tsx:55-62` 提到复用用户级事件流并 `publishCompanyEvent`）、以及它依附的 Project/Agent 概念。照抄前端没有意义 —— 换成 Adelie 的形态，这一面应判**不做或远期**，除非产品真要做「多智能体公司」。

### 2.4 `machines` —— 机器舰队（管理员）

> 读了：`machines-page.tsx`（915 行，全读）、`machines-view.ts` 头 60 行、文件清单（6 文件 1564 行）。

| 能力 | 用户看到什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 舰队卡片 | 一台机器一卡一行（本机在最前）；静止时两行：mono 名 + 一句状态；边缘一个状态点（蓝=活链/琥珀·红=要人/灰=稳态） | `machines-page.tsx:137-578`、`:709-742` | `api.getMachines` | 高 |
| 启用/停用 | 「启用」=装/更新程序 + 起服务 + 连接 + 交付模型配置（合成一个 job，批量一次点）；「停用」放开机器；插头/拔插头两个图标 | `:289-311`、`:76-77`、`:810-846` | `api.useMachines` / `stopUsingMachines` | 高 |
| 批量选择 | 选择栏固定槽位（卡片不因出现/消失而移动）、全选/全不选、两个动词 | `:500-537`、`:289-311` | 同上 | 中 |
| 作业步进器 | 卡片未展开时按 job 阶段画 6 段 stepper，当前段脉冲 | `:680-703`、`machines-view.ts:47-60` | `MachinePhase` | 中 |
| 详情记录 | 展开看版本/安装时间/服务器端口/机器 id/数据根；不能展开的输出日志（最新一行加亮） | `:861-915` | `formatDateTime` | 中 |
| ssh 主机表单 | 搜索选择器 + 新主机/配置主机对话框（对话框文件 6 文件之一） | `:347-472`、`:487-498`、`ssh-host-dialog.tsx` | `api.{addSshHost,getSshHost,updateSshHost}` | 中 |
| 轮询与重探 | 有 job 排队/在跑时 1.5 s 轮询；没人碰的机器按**加宽**的日程重探 | `:68-69,185-206,231-274`、`probe-schedule.ts` | 链式 timeout（不用 interval） | 中 |
| 权限 | `module.json` 里 `admin:true`，非管理员侧栏不出现该行 | `module.json:75-84`、`nav-group-collapse.ts:41-45` | 服务端 403 兜底 | 低 |

**Adelie 现状：** **没有。** Adelie 服务端绑回环、单机（`docs/api.md:22-25` 第 3 条），没有「别的机器」这一概念，没有 ssh 主机配置，没有 `/api/machines`（`docs/api.md` 无一条）。
**差什么：** 页面不能单独抄 —— 前置是服务端的「远程机 + ssh + 隧道 + 把 API 代理过去」这套设施（Penguin 侧的对应物是 `server/src/machines/proxy.ts`，本报告未读）。Adelie 的 `docs/desktop-parity.md:23-26` 已把「附着到已有实例」判为不适用，同源判断在这里也是**不适用/不做**（除非 Adelie 要支持多机 Agent）。

### 2.5 `messaging` —— 把会话接到外部 IM

> 读了：`messaging-panel.tsx`（49 行，全读）、`messaging-binding-editor.tsx`（1135 行，读头 120 行）、文件清单（6 文件 2336 行）。

| 能力 | 用户看到什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 面板 | 与 subagents/Trace 并列的 dock 面板；隐藏的面板不轮询、也不丢表单状态 | `messaging-panel.tsx:24-48` | dock 面板注册（`dock-state.ts:49`）、`panel-meta.tsx:23` | 中 |
| 一个编辑器两个宿主 | 会话行对话框与 dock 面板**共用同一份** hook + body，不分叉（只有 Save 位置与 FAQ 折叠不同） | `messaging-binding-editor.tsx:1-41` | `useMessagingBinding` | 高 |
| 四通道 | feishu / telegram / qq / wechat；每会话每通道最多一份配置，**同时最多一个启用**；启用即绑定、关闭即释放 | `messaging-binding-editor.tsx:6-12`，`messaging-binding-form.ts` | `api.put*Binding`、`setMessagingBindingState` | 高 |
| 扫码接入 | QQ / 微信走扫码连接（二维码 + 轮询），凭据不经过浏览器；微信除此之外没有别的来源 | `qq-scan-connect.tsx`、`wechat-scan-connect.tsx` | `api.start/poll/cancel/verify*Scan` | 高 |
| 已存密钥行 | 字段永远空开始，已存密钥显示为下方掩码行 + 「清除已存…」勾选；清空要先停用通道 | `messaging-binding-editor.tsx:20-31` | 服务端密钥存储 | 中 |
| 状态轮询/测试/FAQ | 面板可见时 3 s 轮询运行状态；可发测试消息；每通道有设置/排障折叠与外部链接 | `messaging-binding-editor.tsx:84-120` | `api.test*Binding`、`sendMessagingTestMessage` | 中 |

规模：17 个 messaging 端点（`grep -rhoE "api\.[a-zA-Z]+" features/messaging`）。

**Adelie 现状：** **没有。** `docs/api.md` 无 messaging 路由；Adelie 的 web 没有 dock 面板这一层（`packages/web/src/components` 里没有面板容器）；Adelie 的会话模型里也没有「per-session 配置」的存储位（`docs/api.md` §3 的 `SessionSummary` 只有 workspace/title/model）。
**差什么：** 整个「把会话接到外部 IM」的能力面 —— 服务端通道适配器与二维码登录、每会话绑定存储、以及承载它的 dock 面板。与 `company` 同类：前端只是表层，主体在服务端。

### 2.6 `semantic-id` —— 语义 id 字段

> 读了：`semantic-id-field.tsx`（203 行，全读）、`id-suggest-notice.ts`（51 行，全读）。该目录只有这 2 个文件（254 行）。

| 能力 | 用户看到什么 | 源码位置 | 依赖 | 复杂度 |
| --- | --- | --- | --- | --- |
| 生成按钮 | id 输入框旁一个「生成 id」按钮（sparkles 图标 + 文字），点了用「名字/使命/描述」向服务端要一个 id，**替换**框里的值 | `semantic-id-field.tsx:103-122,156-179` | `api.suggestSemanticId` | 中 |
| 提示与错误 | 框下一行：调用方自己的校验错优先；否则按来源给「注意」或「静音」提示；拿不出真 id 时给占位符并说明原因 | `id-suggest-notice.ts:28-39` | `SemanticIdSuggestResponse` | 中 |
| 非管理员前缀 | 非管理员的 Project id 是 `<用户名>-<后缀>`，固定部分画成 `lockedPrefix` 只让填后半 | `semantic-id-field.tsx:23-26,47-50` | 无 | 低 |
| 复用点 | 5 个创建对话框共用：Project、Agent、Benchmark、Organization、Channel | `components/layout/project-dialogs.tsx:148`、`features/agents/agents-page.tsx:821`、`features/benchmark/create-benchmark-modal.tsx:173`、`features/company/org-dialogs.tsx:513`、`features/company/channel-dialogs.tsx:121` | — | 低 |

**Adelie 现状：** **没有，且暂时无处可用。** Adelie 没有 Project / Agent / Benchmark / Organization / Channel 这些「要起名字的对象」—— 会话 id 是服务端生成、用户名的规则在服务端（`docs/api.md:85-89`），`docs/api.md` 无 `suggest-id`。
**差什么：** 差的是「有一个用户命名、且 id 要跟着名字走的新实体」。**它是这张表里最容易直接搬的一件**：组件 254 行 + 一个服务端建议器；若 `docs/redesign.md` §1 的 Agent 实体真做出来，「新建 Agent 时给 id」正是它的第一个宿主。

---

## 第三节：Adelie 要不要照着搭骨架 —— 列取舍

先说事实基线。Adelie Web 实测：**18 个 `.tsx`**、`src` 下 `.ts/.tsx`（不含测试）**5153 行**、`styles/global.css` **1753 行**、`docs/api.md` **240 行**。它**没有 URL 路由**（无 `react-router` 依赖，`package.json` 只有 react/react-dom）、**没有全局状态库**（`hooks/useAdelie.ts` 696 行一个大 hook + 往 `Shell` 穿 props）、**没有组件库**（组件全在本仓）、**没有 PWA 之外的样式体系**（手写 CSS 变量）。

### 3.1 路由：**不照抄（现在）**

- 代价：`react-router` +1 依赖；每个面都要有 URL 与守卫；要写 manifest/侧栏派生。收益是深链、后退、可分享。
- Adelie 的真实形态：**只有一片主界面**（对话 + 侧栏），设置与用户管理都是对话框（`App.tsx:86-95,303-319`），没有第二个平级页面。`App.tsx:40-58` 的 `checking/anonymous/authed` 三分支已经是它全部的路由。
- 结论：现在引入路由，付的是 Penguin 那套（`router.tsx` 158 行 + `lib/pages.ts` + `nav-group-collapse.ts`）的成本，换回的是一个还用不上的后退键。**等 Adelie 出现 ≥3 个平级页面（例如按 `redesign.md` 加「用量 / Trace / Agent」）再引入**；届时**借的是 manifest 这个做法**（一条 JSON = 一个页面 + 一行注册表 + 一个可见性谓词，见 `lib/pages.ts:24-34`），而不是照抄 web 的 `router.tsx`（它一半篇幅在处理 iframe/桌面壳装载）。

### 3.2 状态：**只借形状，不搬实现**

- Penguin 的约定是「一个域一个 zustand vanilla store，一个 Provider 挂一份，卸载即重置」（`state/project.tsx:8-10,73-138`）。代价是 +1 依赖，收益是状态不再经 props 穿过整棵树。
- Adelie 的 `useAdelie.ts` 已经 696 行，且 `App.tsx:129-155` 把它的 8 个回调逐个用 `useCallback` 固定后再穿给子组件（注释里还专门解释了为什么要固定 —— 防 `SettingsDialog` 的 effect 反复跑）。这正是 Penguin 用 store 消掉的那类问题。
- 结论：**借「按域切 store + Provider」的形状**，优先把 `useAdelie` 拆成 sessions / transcript / config 三片；用不用 zustand 是次要决定（换 zustand 等于 +1 依赖，代价低，收益是 `useStore` 那种细粒度订阅）。

### 3.3 样式：**不照抄（抄不动，也不必要）**

- Penguin 的样式能力**大部分不在 `styles.css`（仅 492 行）里**，而在共享包 `@prismshadow/penguin-ui`（本报告未读，但从 import 面可见它提供 token、`theme.css`、三套主题、字体、以及 `Button/Modal/Input/PagedDialog/AppShell/…` 整套组件）。照抄 = 连这套包一起抄。
- Adelie 的 `global.css` 已是一套自洽的 CSS 变量体系（`--brand-*`/`--gray-*`/`--bg`/`--border`/`--radius-*`，dark 纯黑，见 `global.css:13-70`），组件类名（`.btn`/`.card`）由它提供。
- 一个**已存在的真实问题**（事实，不是建议）：Adelie `packages/web/package.json` 装了 `tailwindcss` 与 `@tailwindcss/vite`，但 `vite.config.ts` 只挂了 `react()`、`global.css` 里也没有 `@import "tailwindcss"`（`grep -rn 'tailwindcss' packages/web/src` 无命中）—— **Tailwind 装着但没接上**。要么接上（走 Penguin 那条「utility + token」路），要么把依赖删掉，别留着。
- 结论：**不照抄 Penguin 的样式体系**。若将来要 utility 优先，Adelie 可以只借「Tailwind 4 + `@theme` 定义品牌色阶 + token 桥」这一条（`styles.css:17-43`），而**不需要**共享组件包；反之继续用现有 CSS 变量也完全站得住。

### 3.4 请求层：**不抄（Adelie 的更适合自己），但借一条**

- Penguin 用 `EventSource`（`api/sse.ts:43-71`）是因为它的流是 **GET**；Adelie 的流是 **POST**（`docs/api.md:184`）且要带 `Authorization`/token（手机 PWA），所以 Adelie 用 `fetch` + `ReadableStream` 自己分帧（`api/client.ts:238-278`、`api/sse.ts`）。**方向相反，不存在谁更先进**，Adelie 强行改成 EventSource 会做不了。
- 可借的一条：**类型从服务端包来**。Penguin 全站 `import type {...} from "@prismshadow/penguin-server/api"`（如 `state/auth.tsx:9`、`api/sse.ts:15`），Adelie 的 `api/types.ts` 是手写的。Adelie 已有 `packages/server`，可以把契约类型导出成一处，前端 import type，消除「改契约两处改」的风险。
- 可借的第二条（很小）：`formatDateTime` / `tone` 这类纯工具的分层不在骨架范围，略。

### 3.5 结论（一个明确的建议）

> **只借一部分：借「纯函数谓词 + manifest 驱动 + 按域 store」这三条做法，不搬 `router.tsx` / `App.tsx` 的 Provider 组合 / 共享 UI 包 / `api/` 层这四件实现。**

具体到可直接搬的小件（都在百行级）：

| 可搬 | 位置 | 行数 | 为什么值得 |
| --- | --- | --- | --- |
| 设置页可见性谓词表 | `lib/settings-sections.ts` | 114 | 纯函数、Node 下可测、rail 与内容共用一条规则；Adelie 的权限判定现在散在 `lib/permissions.ts` 与组件里 |
| 页面 manifest + 导航派生 | `module.json` + `lib/pages.ts` + `lib/nav-group-collapse.ts` | 118+66+60 | 一条 JSON 定义页面；Adelie 一旦加页面，这就是「不重复抄清单」的模板 |
| 语义 id 字段 | `features/semantic-id/*` | 254 | Adelie 做 Agent 实体时第一个能用上的控件 |
| 每域一个 vanilla store + Provider | `state/project.tsx:73-192` | 120 | 直接对应 Adelie 需要拆的 `useAdelie` |

不建议搬：`router.tsx`（158 行，一半是 iframe/桌面壳装载）、`state/*`（合计 3350 行，且全是 Penguin 的 Project/Agent/Company 语义）、`features/company`（17083 行，服务端不存在）、`components/layout/*`。

---

## 第四节：这次没有找到的东西

**功能上的空缺（有结论，不是没查）：**

- **Penguin web 不是 PWA**：`packages/web` 里没有 service worker、没有 `manifest.webmanifest`（`grep -rn "serviceWorker|manifest.webmanifest|registerSW" src` 无命中；`public/` 只有 `penguin-logo.svg`、`workflow-ui.css`）。Adelie 在这条上**领先**（`register-sw.ts` + `public/sw.js` + `public/manifest.webmanifest` + `index.html` 的 manifest/图标链接）。
- **没有按路由的懒加载**：`router.tsx:11-39` 全静态 import，无 `React.lazy`；唯一 code-split 的是高亮 worker（`main.tsx:27-32`、`vite.config.ts:80-83`）。
- **服务端贡献页面的通道只到一半**：`mergePages`（`lib/pages.ts:40-66`）已实现且有单测，但 `src/` 里**没有任何调用方**（只在 `packages/web/test/pages.test.ts` 用），也就是说 `GET /api/contributions` 这条接缝**当前是死代码**。
- **没有 CSS Modules / CSS-in-JS / 原子类之外的自建样式层**：应用侧只有 `styles.css` 492 行。
- **没有 `docs/` 下独立的「Web 架构」文档**：`packages/docs/content/` 下我未逐篇找（未核实）；仓库根的 `packages/web/README.md` 存在但本报告未读。

**我确实没读、因此没验证的部分（诚实交代）：**

- `state/sessions.tsx`（75 KB）、`state/company.tsx`（38 KB）**只读文件头注释**，其实现细节（分页、事件处理、去重）没有逐行核；`state/theme.tsx`、`state/locale.tsx` 也只读头部。
- `features/company` **53 个文件里只深读了 3 个**（`org-layout.tsx`、`company-nav.ts`、`overview-page.tsx` 头），calendar/finance/handbook/channel/ticket 的页面实现是**按文件名与头注释归类**的，未逐页核。
- `features/messaging/messaging-binding-editor.tsx`（1135 行）**只读前 120 行**；扫码连接两个文件的实现未读。
- `features/settings` 16 个文件里只深读 2 个（`settings-dialog.tsx`、`settings-request.ts`）+ 4 个头；`shortcuts-section`、`plugins-section`、`uploads-section`、`account-section`、`credits-section`、`profile-section`、`trace-import-row` 未读。
- `api/endpoints.ts` 只统计了行数与成员数（2403 行 / 453），**没有读端点实现**，也没找到它是否由脚本生成。
- `lib/` 70 个文件只抽读了 5 个（`pages`/`settings-sections`/`nav-group-collapse`/`account-menu`/`server-context`）。
- **共享 UI 包 `packages/ui` 完全没读** —— 本报告里所有关于「共享包提供什么」的话都是从 import 面推断的，属**未核实**。
- `packages/server` 只在静态托管处读了三段（`app.ts:660-720`、`config.ts:125-132`、`index.ts:371-376`）；`machines/proxy.ts`、路由与鉴权实现未读。
- `packages/web/{e2e,test,scripts}` 未读（`test/pages.test.ts` 只被 grep 命中）。
- 未核实项：移动端/触屏下外壳的行为（只看到 `use-visual-viewport-height.ts` 等文件名）；`module.json` 之外是否还有别的 manifest 消费者；Adelie `SettingsDialog.tsx`（478 行）的完整结构（只读文件头）。
