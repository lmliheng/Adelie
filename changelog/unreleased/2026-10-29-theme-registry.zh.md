# 主题库：一套主题从远端点一下就装到本机，还带了个仿 Trae 国内版的

- **Date:** 2026-10-29
- **Type:** feature
- **Scope:** `server`, `web`, `core`, `docs`
- **Breaking:** no

[English](2026-10-29-theme-registry.md)

在此之前，想要一个别人做的主题只能拿到文件：放进数据根的 `themes/` 目录，或者管理员用「导入主题…」
上传、填地址。现在外观页多了一栏**主题库**——远端的一份主题目录，服务端读进来画成卡片，挑一个点
**导入**就装到本机，和手动放进去的文件一模一样。第一期随目录带一个**仿 Trae 国内版**的主题：近黑灰底
配品牌绿、蓝色链接、输入框蓝色焦点，四个强调色预设。

主题库自己是一个独立仓库（`lmliheng/adelie-themes`）加一个同名 npm 包 `@lmliheng/adelie-themes`：
`index.json` 是目录，`themes/<id>.json` 是主题文件，格式就是本机导入的那套。所以加一个主题只是往仓库里
放一个文件、在目录里加一条，不用改 Adelie。

## 细节

- `packages/core/src/internal/theme-registry.ts`（新增）：目录格式的读取与校验。整套目录**要么全收、
  要么全拒**并列出全部原因——少一条的目录看起来像「作者刚加的没生效」，谁也定位不到。条目里的 `file`
  只能是仓库内的相对路径（拒绝绝对地址、`..`、反斜杠），小色板只能用 `--ui-canvas` / `--ui-surface` /
  `--ui-fg` / `--ui-accent` 四个名字，取值沿用主题文件那套安全规则（禁 `;{}<>\\@`、换行与 `url(`）。
  `resolveRegistryFile(base, file)` 负责拼地址，两条路由与客户端共用一个拼法。
- `packages/server/src/services/theme-registry.ts`（新增）：目录的读取、缓存（成功五分钟、失败三十秒、
  同时在途的两次读共用一次请求）与"从哪读"。默认两个地址：npm 镜像
  `registry.npmmirror.com/@lmliheng/adelie-themes/latest/files/`，以及 jsDelivr 的 GitHub 副本
  `cdn.jsdelivr.net/gh/lmliheng/adelie-themes@main/`——前者在国内快但新版本要等它同步（这次实测新包
  十几分钟还没到位），后者立刻就有、但慢一些。第一个地址**网络层面**不通才换第二个；目录本身读不出来
  （不是 JSON、有条目越界）就直接报原因，因为两个地址给的是同一份文件。`ADELIE_THEME_REGISTRY` 把
  整条链换成自己那一个地址。
- `packages/server/src/services/theme-download.ts`：`fetchThemeFile` 多了 `maxBytes`，因为目录的
  上限（128 KB）与主题文件的上限（256 KB）不是一个数；超限的报错按实际用的那个上限说话。
- `packages/server/src/http/routes/themes.ts`：`GET /api/themes/registry`（登录即可读，返回目录、每条
  是否已装、以及目录读不到时的原因）与 `POST /api/themes/registry/import`（管理员，`{id, overwrite?}`）。
  导入走的是**地址导入那两条路**：同一份 `fetchThemeFile` 抓、同一个 `installTheme` 写，所以内网地址
  守卫、大小上限、`theme_exists` 的 409 全都一样；另外多一道检查——目录把 `trae-cn` 指向一个自称别的
  名字的文件时，在落盘**之前**拒绝（`registry_mismatch`）。
- `packages/web/src/features/settings/theme-registry-section.tsx`（新增）：外观页的卡片栏，只给管理员看
  （卡片上唯一的动作就是导入，而导入是管理员的）。每张卡片画着它在浅色与深色下的底色、面板色、文字色
  与强调色，以及作者、版本、一句简介。目录读不到是一行说明而不是空页面；导入成功后先刷新上面的主题
  列表，再重新读一遍目录，让「已安装」跟服务端的判断走。
- 文案：`packages/web/src/lib/strings{,-en}.ts` 加了主题库那一段；`features/settings/theme-import.ts` 的
  错误映射多了主题库的五个码（`registry_theme_not_found` / `registry_mismatch` / `registry_unusable` /
  `registry_unavailable` / `registry_invalid`），因为服务端那句话只有英文。
- 测试：`packages/core/test/theme-registry.test.ts`（11 条：读入、可选字段、六种越界 `file`、重复 id、
  未知色板名、危险取值、一条坏即整体失败、空目录、缺 `themes`、拼地址）；`packages/server/test/
  theme-registry.test.ts`（16 条：目录与卡片、登录要求、读不到/读不出/一条坏、缓存只走一次网络、第一个
  地址不通换第二个并从那一个取文件、导入、409 与覆盖、未知 id、名字对不上、非管理员）；`packages/web/
  test/theme-import.test.ts` 补了主题库几个码的说法。
- 主题内容仓库 `lmliheng/adelie-themes`：`index.json`、`themes/trae-cn.json`（33 个浅色令牌 / 31 个深色
  令牌 / 4 个强调色预设）、README（两份格式的字段表与"加一个主题"的步骤）、Apache-2.0。npm 上是
  `@lmliheng/adelie-themes@1.0.0`。
- 文档：`packages/docs/content/settings.{zh,en}.md` 在「导入的主题」之后加了「主题库」一段。

## 兼容

- 没有协议、磁盘或接口的破坏性改动：多了两条路由和两个 DTO，`themes/` 目录、文件格式、样式表都没动。
- 不配 `ADELIE_THEME_REGISTRY` 时默认地址就是上面那两个；配了一个不能用的地址（不是 http(s)）会明确
  报 `registry_unusable`，而不是悄悄退回默认的，免得显示的是你没选的那台机器上的目录。
- 真地址验过一遍：从 jsDelivr 读到目录（1 条），取回 `themes/trae-cn.json`（3130 字节），core 的读取器
  认成主题（33 个浅色令牌）。npm 包发布后十几分钟 `registry.npmjs.org` 才可见、npmmirror 至今没同步，
  所以第二个地址不是备胎而是必需。
