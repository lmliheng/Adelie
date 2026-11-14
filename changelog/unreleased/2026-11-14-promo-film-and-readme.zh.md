# 首页放上宣传片，README 改为中文优先

- **Date:** 2026-11-14
- **Type:** process
- **Scope:** `docs`

[English](2026-11-14-promo-film-and-readme.md)

仓库里现在有一段 57 秒的桌面端宣传片 —— `assets/promo/adelie-promo.mp4`，1920×1080、H.264、无音轨 ——
旁边是它的封面帧，两份根 README 都以它开场：封面链接到成片，下面一行小字写明片长。中文成为根
`README.md`，英文移到 `README.en.md`，所以 GitHub 默认展示的那一页是中文；两份文件里的语言切换都指向
新的这一对。

## 安装只留一条路

安装一节只保留 GitHub Releases 上的桌面版、平台表、SmartScreen 提示与首次登录步骤。删掉的是：命令行与
Web App 一节（`install.sh` 一行装、`npm install -g @adelie/cli`、`penguin web` / `penguin chat`、数据根
那段以及 `penguin update` 命令）、列举上游安装入口的警告块，以及 `penguin` 命令名的说明段落。系统需求表
不再要求 Node —— 安装包自带。

## 去掉贡献者墙

两份 README 里的「上游贡献者」一节及其 contrib.rocks 图片已删除。

## 守卫与引用跟着改名

`packages/core/test/plugins.test.ts` 里 README 分类表的守卫：英文条目（可选）指向 `README.en.md`，中文
条目（必查）指向 `README.md`；`docs/README.md` 与 `penguin-harness-dev` 的两处引用也改成了新的这一对。
