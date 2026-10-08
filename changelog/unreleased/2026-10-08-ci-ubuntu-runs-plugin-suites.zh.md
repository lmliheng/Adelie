# CI 真正跑沙盒插件的测试，跑不起来就红

- **Date:** 2026-10-08
- **Type:** fix
- **Scope:** `ci`, `plugins`

[中文版](2026-10-08-ci-ubuntu-runs-plugin-suites.zh.md)

沙盒后端各有一套 live 用例：它们真的启动沙盒程序，让一条命令去写工作区外的文件，并断言内核拒绝它。
这是唯一能证明沙盒起作用的测试。它们先探测一次宿主能否打开沙盒，打不开就整片跳过 —— 在 macOS 上跑
Linux 那套，跳过是对的。问题有两层：Linux 的 `rest` 分片是一串写死的包名，`plugins/*` 从来没被列进去
（4 个沙盒后端包在 Linux CI 上一条都不跑）；而即使排上了，GitHub 的 Ubuntu 机器默认不给普通程序建
user namespace，bwrap 的 live 用例会整片「跳过」，CI 依旧全绿 —— 跳过与通过看不出区别。本次从上游
PenguinHarness 移植（#872，提交 `e3a9eb66`），此前本 fork 没有这一条。

- Linux 的 `rest` 分片改成与 macOS / Windows 同一写法：跑全仓，减去 core、server、web、ui、cli
  这几个已各自分片的包，build 名单也对齐。以后新增的包默认就会被跑到。
- 各平台的 `rest` 分片用 `ADELIE_MUST_RUN` 声明「必须真跑」的套件（按 `plugins/` 下的目录名，
  逗号分隔，名字两侧空格忽略）：ubuntu 上是 `sandbox-bwrap,sandbox-dsh`，macOS 上是
  `sandbox-seatbelt,sandbox-dsh`。**被声明的套件开不了就红**，错误里原样带上探测给的理由；没声明的
  照旧跳过，开发者机器上的行为不变。判定只有 `scripts/must-run.mjs` 里一个函数。
- bubblewrap 由插件自己的测试准备：`sandbox-bwrap` 的 vitest `globalSetup` 调用
  `scripts/vendor-bwrap.mjs`，所以只跑测试（不构建）也测的是用户拿到的那份 bwrap，CI 不必知道这件事。
  该脚本的「已就位」判据补上「每个架构的 `bin/bwrap` 存在且可执行」——被删掉或去掉了可执行位的二进制
  会从缓存重新铺好。
- Ubuntu 的 user namespace 开关留作 CI 的机器前置步骤（`sysctl -w …=0`），与沙盒无关地命名；内核没有
  这个开关时该步骤直接失败，而不是静默跳过。
- `sandbox-bwrap` 的拒绝理由补上 Ubuntu 的开关：Debian 用 sysctl 限制非特权 user namespace，Ubuntu
  23.10 及以后只让带 AppArmor profile 的程序创建它们（24.04 的默认）。运维在沙盒卡片上看到的就是这句话。
