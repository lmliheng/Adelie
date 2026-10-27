# 保存快捷指令被拒时编辑框留着，删除被拒时确认框留着

- **Date:** 2026-10-27
- **Type:** fix
- **Scope:** `web`, `docs`
- **Breaking:** no

[English](2026-10-27-shortcuts-write-refusal.md)

草稿页的**我的快捷指令**折叠夹里，有两处是「问一句再写」的 —— 快捷指令的编辑框和删除确认框 ——
它们过去都按「点了」收尾，而不是按「写成了」收尾。保存按下**保存**的那一刻编辑框就关了：服务端一旦拒绝
（旧版服务端、prefs 行只读、取值不合格），折叠夹回滚，连同刚写下的名称与 Prompt 一起消失，只剩一条
自己会走的提示。删除也一样，确认框先关，原因随后以一条会自己消失的提示出现，而它没能删掉的那一行还留在
折叠夹里。

现在两处都等到写入落地才收框。编辑框把每一个字段原样留着 —— 名称、Prompt、光标 —— 并把服务端的话画在
它们上面；删除确认框把同样的话画在 `ConfirmModal` 的 `refusal` 槽里。两处都是「哪个按钮问的，哪个按钮
重试」。

## 细节

- `packages/web/src/features/chat/shortcuts-folder.tsx`：原来的 `persist()`（发出去就不管、回滚 +
  提示）改成 `write()`，返回原因或 `null`，被拒时仍然回滚列表。`saveDraft` 与新的 `removeDeleting`
  都等它，等在飞时亮 `busy`，拿到结果再决定收不收框。`draftRefusal` / `deleteRefusal` 在开框与关框时
  各清一次，重开的框不会带着上一次尝试的原因。编辑框那条是框体顶部的 `NoticeStrip`（`tone="danger"`、
  `role="alert"`）；确认框那条走 ui 包自己的 `refusal` 槽，前缀用全 App 一致的 `S.common.refused`。
- `packages/web/e2e/shortcuts-write-refusal.spec.mjs`：一条真浏览器用例，用 500（`prefs_readonly`，
  一个没有任何翻译的表里也找不到的码，所以屏幕上的那句话只可能来自探针）拒掉对 prefs 的写入，确认编辑框
  留着、改名还在字段里，确认框留着、那一行还在列表里；然后放行同样的点击，确认两次都落地 —— 包括事后
  读出服务器上存的列表。
- 文档：`packages/docs/content/chat.{zh,en}.md` 的快捷指令一节。

## 兼容性

- 不改依赖、不改接口、不改磁盘格式与协议：仍是同一个 `PUT /api/me/prefs`，从框里发出而不是从框旁边
  发出。服务端一行没动。
