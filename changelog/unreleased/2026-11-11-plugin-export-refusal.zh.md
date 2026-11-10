# 插件没有导出成时，原因留在那张卡片上

- **日期:** 2026-11-11
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 否

[English](2026-11-11-plugin-export-refusal.md)

插件库卡片上「导出插件」拉一次那棵插件目录的 zip，再用一个临时的对象地址交给浏览器。服务端拒了这次下载时，
插件还在、那张卡片还在、连按下去的那颗按钮都还在原地，可唯一解释原因的那句话是一条六秒后自己消失的通知 ——
它浮在列表上方，而读者的视线落在下面某张卡片上。

这正是 7.19 禁止的形状，也是技能页（7.101）与钩子页（7.103）各自已经改过一次的同一处：三处导出调的是同一个
共享下载（`agents/archive-download.ts`），所以三处失败得一模一样，只剩插件卡片这一处还在弹通知。

原因现在画在发问的那张卡片里（`role="alert"`、危险色、最多两行、整句挂悬停），留到下一次尝试开始为止；再按
一次那颗导出按钮就是重试。句子说「导出只是读取，它的文件没有被改动」而不是「插件仍在目录里」：导出确实只读，
而当这次拒绝正是「这个插件已经不在库里」（`unknown_plugin`）时，「仍在目录里」会是假的。

## 细节

- 新增 `packages/web/src/features/plugins/plugin-export-refusal.ts`：`pluginExportRefused(plugin, error)` 造句
  （原因走 `refusalText`，与全应用每一个拒绝同一个规则）。
- `packages/web/src/features/plugins/plugins-page.tsx`：卡片的 `onExport` 从「返回 void、失败弹通知」改成返回
  `WriteOutcome`（与这张卡片已有的更新 / 卸载 / 删除三条拒绝同一个渠道）；拒绝句存在**卡片自己**身上而不是页面上
  —— 与装到某个 Agent 上的那次拒绝（`installRefusal`）不同，导出不会把卡片挪到另一个分区、不会让它重挂，因此
  发问的那一份实例就是留下句子的那一份。
- `packages/web/src/lib/strings{,-en}.ts`：新增一句 `plugins.exportRefused(plugin, reason)`。

## 测试

- `packages/web/test/plugin-export-refusal.test.ts`（新增，6 条）：服务端的原因按错误码念（绝不念线上原文）、
  界面自己抛出的句子原样保留、什么都没说时落到通用文案、念出插件名、点明导出只是读取没有改动文件、英文那一句。

## 兼容性

不改接口、不引入新依赖、不改 Project 配置。插件库的其它行为 —— 两个导入对话框、装到 Agent 上的更新 / 卸载、
管理员删除及其确认框与拒绝行、详情弹窗 —— 原样不变。
