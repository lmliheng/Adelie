# 模型分组收起来时，标题栏也告诉你密钥填了没有

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

[English](2026-11-24-group-key-status.md)

模型页里按厂商分好的那些分组，收起来的时候标题栏对「手填密钥」这一路什么都不说：填没填 key，
标题栏一个像素都不变，只有把分组展开、看到里面那张模型卡片上打的码，才知道已经填过了。现在这些
分组的标题栏上多一条状态 —— 绿点**已配置密钥** / 灰点**未配置密钥**，长得和旁边「连接」那类分组
的状态一样。三个带连接流程的分组（TokenDance、Penguin Go、ModelScope）仍旧只说自己连没连上；
**Custom** 两种都没有，它的每一行各连各的端点，没有「一组一把 key」这回事。

## 细节

- `packages/web/src/features/models/group-header.ts`：新增 `hasKeyStatus()` 与 `keyStatus()`，动作表里
  在 `connect` 之后、owner 那道闸之前插一条 `keyStatus` —— 成员也看得见这条状态，与「连接」状态
  的可见性一致。
- `packages/web/src/features/models/models-page.tsx`：`renderGroupAction` 多一个 `keyStatus` 分支，画法
  与「连接」状态逐字同形（同一个 `data-tooltip`、同一个 `HEADER_TEXT`、`toneDot` 的绿/灰小圆点，
  窄标题栏下文字让位、只留圆点和悬停提示）。
- `packages/web/src/lib/strings.ts` / `strings-en.ts`：**已配置密钥** / **未配置密钥**
  （"Key configured" / "No key"）。
- 判断口径只认**存下来的**密钥（`apiKeyMasked`）：服务端环境变量借给分组的 key 不算数，与「连接」
  状态的口径完全一致。
- `packages/docs/content/models.zh.md` / `models.en.md`：标题栏动作那一段加上这条状态，成员能看到
  的东西里也加上，「整个分组填 key」那一条补一句「写进去了没有看标题栏那条状态」。
- 没有动接口、路由与存储，没有新依赖。

## 测试

- `packages/web/test/model-group-header.test.ts`：动作表按分组种类钉住（含成员看到的那些），并新增
  一组 —— 拿到这条状态的分组正好是「带填写密钥、又没有自己的连接流程」的那些（Venice AI、TokenHub、
  DeepSeek、OpenRouter、vLLM、OpenAI 在里面；TokenDance、Penguin Go、ModelScope、Custom 不在），
  以及 `keyStatus()` 的取值（环境变量借来的 key 仍算未配置）。
- `packages/web/e2e/models-group-key-status.spec.mjs`（新，2 条，真服务端 + 真浏览器）：① 搜索出
  Venice AI，收起状态下标题栏是**未配置密钥**，用标题栏自己的**填写密钥**写进去之后变**已配置
  密钥**，服务端那一行确实存下了掩码；② TokenDance 只显示它自己的**未连接**，Custom 三个状态一个
  都没有。
- `@adelie/web` 的 `tsc --noEmit`、`oxlint`、`prettier --check` 全过；全量单测 356 个文件通过。

## 兼容性

没有动路由、线上类型与存储格式：标题栏多一个只读状态，窄窗口下它像「连接」一样只剩一个小圆点加
悬停提示。
