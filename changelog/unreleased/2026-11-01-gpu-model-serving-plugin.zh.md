# 插件库收下 gpu-model-serving：在租来的 GPU 机器上立起模型服务

- **Date:** 2026-11-01
- **Type:** feature
- **Scope:** `plugins`, `core`, `docs`
- **Breaking:** no

[English](2026-11-01-gpu-model-serving-plugin.md)

`gpu-model-serving` 此前只发布在 npm 上（`@adelie/gpu-model-serving`），要靠**从 npm 导入**那一手才能装进
某个 Agent，插件市场里没有它。现在它随构建发布，插件库与插件市场各有一条。

它带的技能把一台 GPU 机器变成 OpenAI 兼容的模型端点：选实例与权重落盘的位置、直接取已量化好的
checkpoint、搭 pip 装的 CUDA 工具链、以 detached 方式拉起 `serve.sh`，最后按健康检查、模型清单、tool call、
流式与重复前缀五项逐项验证。第一次部署会踩的坑按「现象 → 原因 → 修法」写进 `reference/pitfalls.md`；
可用的完整 `serve.sh` 与显存算术在 `reference/sglang-serve.md`；租用实例的控制台、端口与计费在
`reference/gpu-cloud-console.md`。

不预装：它装到要自己起模型服务的 Agent 上，不在每个新 Agent 的预置名单里。

## 细节

- `plugins/gpu-model-serving/`（新增）：`plugin.json`（`category: software-development`、
  `preinstall: false`）、`package.json`、`icon.svg`、`LICENSE`（Apache-2.0）、`README.md`，以及
  `skills/gpu-model-serving/SKILL.md` 与四份参考文档。内容取自 npm 上已发布的那一版
  （`@adelie/gpu-model-serving@0.1.0`，插件自己的版本 `2026.10.30.1`），另按仓库约定补两处：
  `package.json` 的版本跟仓库走（`0.6.1`），`SKILL.md` 补上每个库内技能都有的 `## Before you start`。
- `packages/{core,cli,desktop}/package.json` 与 `pnpm-lock.yaml`：加
  `@adelie/gpu-model-serving: workspace:*` —— 加载器只认宿主包的依赖列表，不登记依赖的插件在市场里就是
  不可见的。
- 市场货架随之从 27 条变成 28 条（四个沙箱后端是手写的条目，其余每个自带插件包各一条）；这一条是
  `@adelie/gpu-model-serving`、版本 `2026.10.30.1`、分类 `software-development`，都读自包本身。
- `packages/core/test/plugins.test.ts`：插件总数 23 → 24。
- `plugins/README.md`、`README.md`、`README.zh.md` 与 `packages/docs/content/skills.{zh,en}.md`：分类表
  与说明各补一条 —— 仓库里的守卫拿这些表和插件库逐条对。
- 数据根 `plugins/gpu-model-serving/` 里那份用户插件从此不再生效：同名时内置的那份优先
  （`pluginRoots`）。两份内容逐字节相同，所以那份删掉即可。

## 兼容

- 原有接口一个都没动：多了一个插件、插件清单与两张表里多一个名字。
- 从 npm 装过这个插件的部署，升级后接到的是内置的这一份，插件版本同为 `2026.10.30.1`，不会显示成有更新。
