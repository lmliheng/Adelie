# fork 推进台账（`fork/penguin-base`）

> Adelie 从 2026-10-04 起改用 PenguinHarness 的整棵代码树当基座（用户定的「B」方案）。
> 决定原文与背景在 `FORK.md`；这份文件是**这条分支上的工作量台账**，与 `main` 上那两本
> （`docs/engine-progress.md`、`docs/web-progress.md`，都是旧 Adelie 的）无关 —— `main` 是旧的、
> 自写的 Adelie，已经冻结，不再往上加东西。

## 纪律（每轮开工前读一遍）

- 在 `git worktree` 检出的 `/root/adelie-fork` 里干活，**不要在 `/root/Adelie` 的工作区切分支**：
  `adelie-web.service` 直接读 `/root/Adelie/packages/{server,web}/dist`，切过去会把线上那个
  旧 Adelie Web 换成另一份服务端。
- `/root/penguin-harness` 只读，是 `upstream` remote 的来源；`main` 不动。
- Apache-2.0 义务照 `FORK.md`：保留 `LICENSE` 与 `THIRD-PARTY-NOTICES.md`、不留上游商标做我们的
  名号，改动要看得出来（台账 + 提交说明）。
- 每一条都要有可复现的命令与输出才算完成；卡在需要用户拍板或需要新凭证时，**停在那一项上写清卡点**，
  不要猜着改。
- 不要切版本号、不发 npm、不发安装包、不发邮件（发布链路是最后一步，届时单独定）。

## 待办

### 2. 自有化（改名、数据根、端口）

- [ ] 2.1 **界面品牌**：`packages/ui` 与 `packages/web` 里用户看得见的名字、图标、标题、文案
      （`packages/ui/src/components/icons/logos/penguin-logo.tsx`、`boot.ts`、`packages/web/public/*`、
      `index.html` 标题与 `<meta>`）。验收：起服务截图，界面里不再出现 PenguinHarness / 企鹅图标。
- [ ] 2.2 **数据根**：`~/.penguin` → `~/.adelie`；`PENGUIN_HOME` 等环境变量名是否跟着改，先定口径
      （建议：变量名改成 `ADELIE_*`，并在 `resolveRoot()` 里兼容读一次旧名，方便旧数据迁过来）。
- [ ] 2.3 **端口与 profile 默认值**：服务器默认端口、CLI 默认端口（现在是 7369）与旧 Adelie 的
      4000 / 7370 对齐，避免两个产品抢端口。
- [ ] 2.4 **README 与包元数据**：根 `README.md` 换成 Adelie 自己的说明 + 「基于 PenguinHarness」的
      来源声明（`FORK.md` 已有，README 里指过去即可）。
- [ ] 2.5 **上游 `landing` / `docs` / `ui-gallery` / `hmr` 四个包的去留**：逐个人拍板（卡点 A）。

### 3. 把旧 Adelie 已经做过的东西接回来

- [ ] 3.1 审批口径三档（旧 Adelie 的行为约定）对照上游的审批模型，能删就删。
- [ ] 3.2 模型目录（deepseek / kimi / qwen）与费率表。
- [ ] 3.3 用量与成本页（旧 Adelie `web` 台账第 4 条那一套：`/api/usage` + 成本中心）。
- [ ] 3.4 用户与两档角色、会话归属。
- [ ] 3.5 桌面壳：上游 `penguin-desktop` 与旧 Adelie 那个取一个。
- [ ] 3.6 用真模型发一条消息（需要 key；这是步骤 1 唯一没验完的一条）。

### 4. 发布链路

- [ ] 4.1 npm scope：`@prismshadow/penguin-*` → Adelie 自己的 scope（旧包是 `@lmliheng/adelie`、
      `adelie-core` / `adelie-server` / `adelie-web` / `adelie-desktop` 等）。**只和发布一起做** ——
      内部改名 968 个文件、零功能收益，放到这里一次做完。
- [ ] 4.2 GitHub Pages（PWA）、设计站、Windows 安装包三条流水线按新仓库结构重写。
- [ ] 4.3 旧的四件已发布产物怎么处置（卡点 B）。

## 卡点（要用户拍板才动的）

- **A. 上游四个包的去留**：`landing`（宣传页，393 处品牌字）、`docs`（文档站，223 处）、
  `ui-gallery`（组件画廊）、`hmr`（热更新宿主）—— 留哪些、删哪些。
- **B. 旧的四件产物**：已上线的 PWA、六个 npm 包、Windows 安装包，要不要下架 / 重发。
- **C. 仓库落点**：新基座仍发在 `lmliheng/Adelie`（`main` 是旧 Adelie）还是另开仓库。

## 已完成的轮次

| 日期 | 条目 | 做了什么 | 验证 | 提交 |
| --- | --- | --- | --- | --- |
| 2026-10-04 | 0 | 建 `fork/penguin-base` = 上游 `develop` @ `18d7c137`，加 `upstream` remote，`git worktree` 检出到 `/root/adelie-fork` | `git log -1`、`git remote -v`；已 `push origin fork/penguin-base` | `f30a91b8` |
| 2026-10-04 | 1 | 写 `FORK.md`（来源、许可证义务、要改什么、旧 Adelie 在哪） | 文件存在，随基座一并推送 | `f30a91b8` |
| 2026-10-04 | 1 | 本机装、构建、起服务、真浏览器看一眼 | 安装 3.2s 全 hard-link；`pnpm -r build` 全绿（web 2.58MB JS / 787KB gzip）；`PORT=7391` 起来后 Playwright 截图 `fork-look/01-app.png`，console 无 error | 无（环境动作） |
| 2026-10-05 | 1 | 复跑基座测试 | ui 999 / core 1346+5skip / server 2552+2skip / cli 509 / web 2886+2skip，合计 **8292 passed / 9 skipped / 0 failed**，`EXIT=0` | 无（环境动作） |
