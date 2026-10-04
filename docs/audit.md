# 应用体检（自检）

> 一条命令问一次「这个应用现在有没有毛病」：`node scripts/audit.mjs`。
> 它替人干的是「该看哪儿」这件**可枚举**的事；剩下需要判断的部分，才是人（和模型）的活。

## 为什么要有它

Adelie 是一条长期产品线：一次对话会被压缩、会被忘掉，而缺陷不会。人工过一遍仓库，
每次都要重新想「该看哪儿」，而这个问题本身是有答案的 —— 下面每一条都对应一类**已经
发生过**的事故：

| 已经发生过 | 所以有了这条检查 |
| --- | --- |
| 删了 `anthropic.provider.ts`，产物里那两个 `.js` 还在，差点跟着发布包发出去 | 产物与源码一致（`dist-clean`） |
| 加了路由忘了写进契约，另外三端不知道它存在 | 契约与实现的路由一一对应（`routes-in-docs`） |
| 前端请求了一个契约里没有的路径 | 前端请求路径都在契约里（`web-api-paths`） |
| 界面按错误码分支，服务端多出一个码没人知道 | 错误码与契约 §8 对齐（`error-codes`） |
| 加一家厂商要改三处，漏掉一处表现为「服务端支持、界面里选不到」 | 提供方没有绕开模型目录（`provider-hardcode`） |
| 密钥文件默认 0644；值被顺手打进了日志 | 密钥卫生（`secrets`） |
| issue 草稿少一段、少个标签，同步脚本整个失败 | 草稿合规（`issue-drafts`） |
| 包之间靠 workspace 软链跑得通，装出去 ERR_MODULE_NOT_FOUND | 依赖有声明、版本一致（`consistency`） |

唯一一条回答「能不能用」而不是「看着对不对」的是**端到端冒烟**（`e2e`，要
`--with-e2e`）：真服务端 + 真引擎 + 假模型端点 + 真浏览器，发一条任务、批一次审批、
检查工作区里真的落了文件、console 没有 error。它需要外部条件（playwright 与 chromium），
缺条件时**跳过并说明**，不算失败 —— 把「这台机器没装浏览器」报成应用的缺陷，几次之后
这种报告就没人看了。

```bash
ADELIE_PLAYWRIGHT=/path/to/dir/with/playwright/package.json \
CHROME_PATH=~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
  node scripts/audit.mjs --with-e2e
```

## 怎么用

```bash
node scripts/audit.mjs                 # 全套：闸门 + 静态检查（提交前、发版前）
node scripts/audit.mjs --no-gates      # 只跑静态检查，秒级（改一行之后跑这个）
node scripts/audit.mjs --with-e2e      # 再加端到端冒烟（几十秒，要浏览器）
node scripts/audit.mjs --json          # 给别的工具吃
node scripts/audit.mjs --only=dist-clean,secrets
node scripts/audit.mjs --fail-on=P3    # 连提醒也要挡（发版前的严格模式）
```

门槛由 `--fail-on` 决定（默认 `P1`）：只有**该档及更重**的发现会让退出码变成 `1`。
**已经被草稿记下的发现不挡门槛** —— 它们由 issue 跟踪，把 CI 一直挂红只会让大家开始
忽略这一步。

CI 里跑的是 `--no-gates --fail-on=P2`（`.github/workflows/ci.yml`）：三个闸门 CI 本来就
单独跑，体检补的是它们看不见的那一半，而契约漂移、产物残渣这一档要能挡住发布。

## 三条纪律

1. **体检不修东西。** 它只报告。一个会自动改代码的体检脚本，第一次误报之后就不会再有
   人敢跑它。修与不修由人决定，或者由代理在**看懂证据之后**决定。
2. **每条发现都带证据。** `文件:行`、命令或产物路径，能被独立复核（与 `docs/issues.md`
   的「证据」那一段同一条规矩）。
3. **能天天跑。** 静态检查全是读文件，秒级；贵的三个闸门默认也跑，但可以跳过。

## 报出来的东西怎么处理

| 情况 | 怎么办 |
| --- | --- |
| P0（数据丢失 / 密钥泄漏 / 主流程不可用） | 立刻停下手里的事先修，修完重跑 |
| P1（主流程出错 / 有安全含义） | 这次任务内修掉，或写成草稿并在回答里说明为什么先不修 |
| P2 / P3 | 当场能修的修掉（进 commit + CHANGELOG）；修不了的写成 `docs/issues/` 草稿 |
| 已经在草稿里的 | 体检只提示「已有草稿：docs/issues/xxx.md」，不重复报，也不重复开条目 |

**修完必须重跑一次** —— 条目消失才算数，这是「关之前必须回过一次」在体检上的对应。

## 加一条新检查

`scripts/audit.mjs` 里的 `CHECKS` 是一张表，一条检查就是一个 `{ id, title, run() }`：

- `run()` 返回 `{ findings, notes }`；`finding = { level, title, detail, evidence }`；
- 只读、不写、不判断「该不该修」；
- **宁可漏报也不要误报**：一条经常误报的检查等于没有检查。写之前先想想它在
  「一切正常」的仓库上会不会响 —— 比如「这一行出现了 token 这个词」会命中所有文案，
  而「模板里插值了一个名字像密钥的变量」才命中真正的泄漏。

加检查的动力应该来自真实事故或真实欠账，而不是「这样看起来更严谨」。

## 代理怎么用它（主动更新）

体检是「主动更新这个应用」这条流水线的入口。一次完整的自检循环：

1. `node scripts/audit.mjs`（默认门槛）—— 先看**新**发现；
2. 逐条判断：P0/P1 当场修；P2/P3 能顺手修就修（进 commit + CHANGELOG），修不了的
   写成 `docs/issues/` 草稿（格式见 `docs/issues.md`，写完体检会把它认成「已记下」）；
3. 修完**重跑**体检，条目消失才算数；
4. 跑完三个闸门（`pnpm typecheck` / `test` / `build`），提交，把草稿一起带上。

配套的两个脚本：

- `scripts/clean-dist.mjs` —— 让各包的 `build` 先清 `dist`（`tsc` 只写不删，删掉的源
  会以产物形式留在发布包里）。它只肯删 `packages/<包名>/dist`，别的路径一律拒绝。
- `scripts/issues-sync.mjs` —— 把草稿推成 GitHub issue（要 `GH_TOKEN`，见
  `docs/issues.md`）。

「发现问题第一时间记下来」与「主动去修」是同一件事的两半：体检负责让问题浮出来，
草稿负责让它不会随着对话一起被忘掉，修完的提交与 CHANGELOG 负责留下结论。
