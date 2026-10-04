# Web 端推进台账

> **第一版：** 2026-10-04
> **谁在读它：** 定时任务 `adelie-web-buildout` 每 4 小时醒一次，取**第一个未勾选**的条目做掉。
> **顺序来源：** `docs/web-parity.md` 第 7 节「修订后的优先顺序」。设计细节在每行指向的草稿里，
> 不要在这里重复它们 —— 这里只记「做什么、怎么算做完、做完了出现什么」。

## 一轮的固定动作

1. 读本文件，取第一个 `- [ ]`；读它指的草稿（`docs/issues/web-*.md`）。
2. 只按草稿实现这一条，**不动无关文件**（顺手发现的问题写成新草稿，不顺手改）。
3. 验证：`pnpm --filter adelie-web typecheck && pnpm --filter adelie-web test && pnpm --filter adelie-web build`；
   界面类改动还要 `node scripts/audit.mjs --with-e2e`（环境变量见 `docs/audit.md`），
   以及真浏览器看一眼（Playwright，登录页填 token）。
4. 勾上本条，在 §「已完成的轮次」追加一行：日期 + 条目号 + 一句结果 + 一句残留。
5. `git commit` + `git push`（**不切版本、不发产物** —— 发版是人的决定）。
6. 用 `csu-mail` 技能发一句汇报到 0110230306@csu.edu.cn（标题 `Adelie web 推进 <条目号>`）。

**卡点就停：** 需要拍板（例如思考等级的语义）或需要新凭证时，不要猜着做 —— 勾不了就留着，
在邮件里写清「卡在哪、要什么决定」，然后结束这一轮。

**口径：** 一次一条，宁可少也不要半成品；每条做完时 `main` 必须是绿的。

## 条目

- [x] **1. 路由骨架与导航空壳** —— 引入 `lib/router.ts` + `hooks/useRoute.ts`（不引 react-router），
  左栏顶部五入口（项目 / 智能体 / 模型 / 插件 / 成本中心）+「对话」，五个页面先落成占位
  （说清是什么、卡在哪、草稿在哪）。URL 可分享、可前进后退、深链刷新不白屏。
  草稿：`docs/issues/web-left-rail-navigation.md`。验收：`/agents` 直接打开落在智能体页；
  rail 高亮跟着 URL；命令面板里有六条导航命令。
- [x] **2. 移动端剩余排布** —— `docs/issues/web-mobile-layout.md` 里顶栏以外的那几条
  （输入区在窄屏的控制带、抽屉里 rail 的高度预算、横向不溢出）。验收：390×844 与 360×640 下
  `documentElement.scrollWidth === innerWidth`，且新加的控件都能点到（≥40px）。
- [ ] **3. 输入区一期：模型切换 + 权限** —— `docs/issues/web-composer-toolbar.md` 里只用现有接口的两件
  （`PATCH /api/config` 改模型、审批策略）。验收：换模型后下一轮真的走新模型（看会话事件里的 provider/model）。
- [ ] **4. 成本中心（= 路线图 P4）** —— `docs/issues/web-usage-cost-center.md`；顺带做「会话级 token 累计」
  （上下文环要用它）。验收：`/usage` 页有汇总卡 + 按模型/按会话两张图，数字与 `/api/usage` 对得上。
- [ ] **5. 项目实体** —— `docs/issues/web-left-rail-navigation.md` 二期上半：`~/.adelie/projects.json` +
  `GET/POST/DELETE /api/projects`，会话归属项目，工作区由项目带。要动服务端与契约。
- [ ] **6. 智能体实体** —— 同上二期下半：`~/.adelie/agents/<id>/` 目录约定、`GET/PUT /api/agents/:id/config`，
  九 tab 里先做「指令」与「密钥」两个 tab。
- [ ] **7. 模型页** —— `docs/issues/web-models-page.md`：每项目一张模型表、哪家有密钥、默认指哪条、
  价格三档数字（第 4 条的成本要它才算得出钱）。
- [ ] **8. 附件（图片 / 文件）** —— 输入区控件带二期；先做图片（走已有消息类型），文件要服务端能落盘。
- [ ] **9. 技能面板** —— 输入区控件带二期；依赖技能目录（`skills/*/SKILL.md`）先存在。
- [ ] **10. 思考等级** —— 输入区控件带三期。**先拍板语义**（是模型参数、还是 prompt 前缀、还是两者）；
  没拍板前不动。
- [ ] **11. 上下文占用环** —— 输入区控件带三期；依赖第 4 条的会话级 token 累计与模型的上下文上限表。
- [ ] **12. 插件** —— `docs/issues/web-left-rail-navigation.md`，远期：要 skills / hooks 运行时先存在。

> 排在 12 之后的还有 `docs/web-parity.md` 第 3 节的**批次 2（dock 宿主）**与**批次 5（trace）** ——
> rail 是「页面往哪放」，dock 是「面板往哪放」，先有页面再谈面板。

## 已完成的轮次

- **2026-10-04 · 1** —— 引入 `lib/router.ts`（纯函数，12 条单测）+ `useRoute` + `NavRail` + `PlaceholderPage`，
  `App.tsx` 按 `pageIdOf(path)` 分派，命令表加六条导航命令；`docs/web-parity.md` §2 的「不搬 router」
  前提失效，故自写 60 行而不用 react-router（`base: './'` 下 basename 有歧义）。
  `scripts/e2e.mjs` 加了一组导航断言（点五项 → URL 跟着变、后退可用、`/agents` 深链刷新不白屏、
  手机上抽屉点完自己收起），以后每轮 `--with-e2e` 都会挡住回退。
  **同轮的界面决定：** 新会话的空态删掉用法说明段与四张示例任务卡（用户要求）——
  那一屏只留字形 + 品牌行 + 一句话标题，`EmptyState` 因此不再需要任何 props；
  输入框下方那句常驻提示（`Composer` 的 `.disclaimer`）保留，它不只在空态出现。
  残留：五个页面是占位；`/chat/:sessionId` 深链未做（会话 id 还没进 URL）。

- **2026-10-04 · 2** —— 手机排布（草稿：`docs/issues/web-mobile-layout.md`）。
  **抽屉里的 rail 从「6×40 竖排」改成两列**（243 → 145px：360×640 上会话列表 265 → 363px，
  横屏 640×360 上从 **16px** 回到 83px，且抽屉底部信息不再被切出屏幕）；抽屉自己补
  `env(safe-area-inset-*)`（它盖住顶栏，也就盖掉了顶栏那份留白）；`.nav-item` 与 `.brand`
  提到 40px、触屏下文本域 40px；**输入区的控制带**单独包成 `.composer-tools` —— 窄屏只滚
  这一层，发送按钮钉在右侧（整条一起滚会把发送推出屏幕），塞 6 个模拟控件验过。
  另外发现：**320×568 上布局视口被撑到 334**（整页缩到 0.96，与上一轮 433px 同一类病），
  收窄顶栏间距后回到 320。
  验证：`pnpm --filter adelie-web typecheck / test / build` 全过（83 条单测）；
  `scripts/e2e.mjs` 的手机段从一档扩成四档（390/360/320/640×360），每档断言溢出为 0、
  可点元素 ≥40px、抽屉里至少剩一条会话行、底部不被切 —— 反向验过：把旧排布打回去，
  横屏那档立刻变红（16px / 391px）。
  残留：抽屉手势与背滑、设置对话框的窄屏分节、`.who` / `.conn` 的 hover-only 信息、
  真机安全区（桌面 Chromium 的 `env()` 恒为 0）、横屏下会话列表仍只有 83px。
  commit __HASH__。
