# 技能没有导出成时，原因留在发问的那一行下面

- **日期:** 2026-11-08
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 无

[English](2026-11-08-skill-export-refusal.md)

Agent 设置 → 技能页每一行都有「打包导出」：它拉一次那棵已安装目录的 zip，再用一个临时的对象地址把它交给浏览器。
服务端拒了这次下载时，技能还在、那一行还在、连按下去的按钮都还在原地，可唯一解释原因的那句话是一条六秒后自己
消失的通知 —— 它浮在列表上方，而读者视线落在下面某一行上。

这正是 7.19 禁止的形状。导出失败是唯一会让人担心「已安装的那份是不是被动了」的时刻，所以句子除了念原因，还
明说技能仍然装在这个 Agent 上。

原因现在画在发问的那一行下面（`role="alert"`、危险色、最多两行、整句挂悬停），留到下一次尝试开始为止；再按
一次那颗导出按钮就是重试。哪一行读这句话由技能名决定，同一时刻只有一条，别的行一个字都不变。

## 细节

- 新增 `packages/web/src/features/agents/skill-export-refusal.ts`：`skillExportRefused(skill, error)` 造句
  （原因走 `refusalText`，与全应用每一个拒绝同一个规则），`skillExportRefusalFor(refusal, skill)` 决定这次
  拒绝归哪一行。
- `packages/web/src/features/agents/skills-tab.tsx`：`exportSkill` 失败时不再弹通知，而是记下 `{ skill, text }`
  并交给那一行；每次尝试开始先清掉上一句（它属于上一次尝试）。列表行从单行 flex 改成「行 + 可选的拒绝行」，
  悬停背景与分隔线留在外层，其余排版不动。
- `packages/web/src/lib/strings{,-en}.ts`：新增一句 `skills.exportRefused(skill, reason)`。

## 测试

- `packages/web/test/skill-export-refusal.test.ts`（新增，9 条）：服务端的原因按错误码念（绝不念线上原文）、
  界面自己抛出的句子原样保留、什么都没说时落到通用文案、念出技能名、点明它仍装在这个 Agent 上、英文那一句；
  以及「这条拒绝只归它自己那一行」的三条。
- `packages/web/e2e/skill-export-refusal.spec.mjs`（新增，真服务端 + 真浏览器）：从一个真装着的技能行点导出，
  归档路由被 `page.route` 拒成 500；断言句子只出现一次、就在那一行下面、逐字是界面自己的话、通知区里没有它、
  那一行自己的文字与尝试前一模一样、**七秒之后**还在，并且服务端那份已安装列表没有变化。放行后同一颗按钮再按
  一次：句子消失，zip 真的作为下载交到浏览器手上。

## 兼容性

不改接口、不引入新依赖、不改 Project 配置。技能页的其它行为 —— 导入（对话 / zip 两条路）、卸载确认框与其
拒绝行、提示词注入开关 —— 原样不变。
