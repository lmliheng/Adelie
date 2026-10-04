# 发布说明书

一次发布产出四件东西，全部由 `.github/workflows/release.yml` 在打 tag 时产出：

| 产物 | 谁做 | 放在哪 |
| --- | --- | --- |
| `@lmliheng/adelie`（CLI）与五个库（core / providers / tools / runtime / server） | `scripts/publish-packages.sh` → npm | npm registry |
| `Adelie-Setup-<version>-x64.exe` + `Adelie-Portable-<version>-x64.exe` | `windows-latest` 上 `electron-builder --win` | GitHub Release 附件 |
| `adelie-web-<version>.zip`（Web 静态产物 + PWA） | ubuntu 上 `vite build` | GitHub Release 附件 |
| 可安装的 PWA（同一份 Web 产物） | GitHub Pages（可选，见下） | `https://lmliheng.github.io/Adelie/` |

## 怎么发一个版本

```bash
# 1. 改版本号（五个可发布包要一致）与 CHANGELOG
pnpm -r exec npm version 0.1.1 --no-git-tag-version   # 或逐个改 package.json

# 2. 本地先跑一遍守门人
pnpm typecheck && pnpm test && pnpm build

# 3. 提交 + 打 tag + 推
git commit -am "chore: 版本 0.1.1"
git tag v0.1.1
git push origin main --tags
```

tag 一推，工作流就跑：`verify` 先跑三件套，绿了之后三件事并行（npm / Windows 安装包 / Web），
最后 `release` 把安装包与 Web 压缩包挂到 GitHub Release 上。

## 需要在仓库里配的东西

| 名字 | 类型 | 作用 | 不配会怎样 |
| --- | --- | --- | --- |
| `NPM_TOKEN` | Secret | npm 发布用的 Automation Token | 脚本打印「未配置，跳过 npm 发布」并继续，其余产物照发 |
| `ADELIE_DEPLOY_PAGES` | Variable（值 `true`） | 把 Web 产物发到 GitHub Pages，手机才能装 PWA | 跳过 Pages 部署，只留下 zip 附件 |
| Pages 的 Source | 仓库设置 | Settings → Pages → Source = GitHub Actions | Pages 那一步会失败 |

## 发布后的邮件

发布完成后给 `0110230306@csu.edu.cn` 发一封汇总信（产物清单、版本号、链接），
由 agent 用 `agent_state/skills/csu-mail` 那条通道发。**凭证不进 CI**：
如果哪天想让工作流自己发信，再另外决定要不要把邮箱专用密码放进 GitHub Secrets。

## 版本号约定

- 可发布的六个包（core / providers / tools / runtime / server / `@lmliheng/adelie`）版本号必须一致 ——
  `pnpm-workspace.yaml` 里的 catalog 只管工具版本，包与包之间的 `workspace:*` 在发布时会被
  改写成具体版本，版本不一致时依赖会解析不到。
- **CLI 为什么带 scope**：不带 scope 的 `adelie` 被 npm 的相似名保护挡下了 ——
  `403 Package name too similar to existing package dexie`。改成 `@lmliheng/adelie` 就能发，
  命令名不变（`bin` 仍是 `adelie`）。六个引擎库里只有 CLI 撞上这条规则。
- web / desktop 是 private，不参与 npm，但版本号跟着走，方便对着 Release 找人。
  （`adelie-server` 可发布：桌面壳要单独装它，`adelie serve` 也在运行时加载它。）
- **入口两份，靠 `publishConfig` 切换**：工作区里的六个包一律 `main` / `types` / `exports` 指向
  `./src/index.ts`，`pnpm pack` / `pnpm publish` 时再按 `publishConfig` 换成 `./dist/*`。
  不这样做的话，干净克隆上 `pnpm typecheck` 会死在 `Cannot find module 'adelie-core'`（或 `adelie-server`）——
  类型检查跑在构建之前，而 `dist` 还不存在。发版前用
  `pnpm --filter adelie-server pack --pack-destination /tmp` 并解包看一眼 `package.json`，
  确认里面指向的是 `dist`。
