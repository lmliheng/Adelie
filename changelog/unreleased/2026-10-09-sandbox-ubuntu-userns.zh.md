# Linux 沙盒在 Ubuntu 23.10 及以后有了成文的一步

- **Date:** 2026-10-09
- **Type:** fix
- **Scope:** `plugins`, `docs`

[English](2026-10-09-sandbox-ubuntu-userns.md)

默认的 Ubuntu 24.04 上 `kernel.apparmor_restrict_unprivileged_userns` 为 `1`：只有 AppArmor profile
允许的程序才能创建非特权 user namespace，于是后端自带的 bubblewrap 过不了启动检查，报
`setting up uid map: Permission denied`。文档此前只写了 Debian 的开关；而需要 root 的那份 profile，
以普通用户运行的几种安装（安装脚本、npm、Release 压缩包、Docker 容器）都装不了。本次从上游
PenguinHarness 移植（#977，提交 `45885985`），此前本 fork 没有这一条。

- CLI 快速开始新增 **Ubuntu 上的沙盒** 一节（中英双份）。它给出只需做一次的 root 步骤：为后端自带的
  bubblewrap 装一份 AppArmor profile，路径模式覆盖这个包在数据根父目录下可能被解压到的每个位置 ——
  安装目录随包带的插件、下载到数据根目录的插件、热推送携带的插件 —— 升级在同一路径上替换包，因此
  依然有效。它也写明两种替代做法（为属于 root 的 bwrap 装 profile，或对所有程序调低这个开关），以及
  数据根或安装目录不在 `~/.adelie` 下时该怎么办。
- 后端建不起基础配置时，沙盒卡片上的原因在 Debian 的开关旁写出 Ubuntu 的开关，并指向新的一节；
  后端的 README 写明了这项要求。
- 新增一条用例，断言拒绝文案同时点名两个开关。

这一节用的是 Adelie 自己的名字（`@lmliheng/penguin-plugin-sandbox-bwrap`、`~/.adelie` 数据根与它
的 `ADELIE_HOME`，旧名 `PENGUIN_HOME` 仍会读），不是上游的。
