# 文件树里读不出来的目录留着那一行，原因写在它下面

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `web`, `ui`

[English](2026-11-22-files-dir-error.md)

文件面板第一次打开某个目录时才去列它。根以下的目录这一读失败时，过去是弹一条通知、同时把那一行从树上
删掉 —— 六秒之后，树上既没有一个字说这个目录还在，也没有一个字说刚才到底怎么了；读者的位置被一次失败
拿走了，唯一的路是猜「刷新」有没有用。

现在那一行留在原处、仍然展开着，原因用危险色写在它下面；点那一行就是重试。根目录的失败不变：它没有
一行可以挂，仍是整块替换掉树（7.19 的规矩：句子留在尝试发生的地方）。

## 细节

- `packages/ui/src/components/files/file-tree/tree-rows.ts`：`FileTreeRow` 多一个可选的 `error`
  —— 这个目录为什么读不出来。行、行的位置与展开状态是读者的，失败只多加一句话。
- `packages/ui/src/components/files/file-tree/file-tree.tsx`：展开着、带着 `error` 的目录把原因画在
  本该是子行的位置（与原「空目录」那一行同样的缩进与字号，危险色），并且不挂 `group`。它不是一行，
  树的键盘走查永远不会落到它上面。
- `packages/web/src/lib/workspace-tree.ts`：`flattenTree` 收下失败的那张表、把原因放到目录那一行上
  （已有列表永远优先，两者不会同时出现）；`movedFailures` 让原因跟着改名走，`droppedFailures`
  在条目被删掉时把它的原因一起丢掉。
- `packages/web/src/features/chat/workspace-browser.tsx`：`loadDir` 的非根分支改成记下原因，不再弹
  通知、不再收起那一行（仍旧把旧列表删掉，否则早先读到的行会活过这个目录本身）；`refreshAll`
  也会重试那些仍开着、上次读失败了的目录；`toggleDir` 对失败的那一行是重读而不是收起；改名时原因跟着
  走，删除时一起丢掉。
- `packages/web/src/lib/strings.ts` / `strings-en.ts`：新增 `files.dirListFailed` —— 原因，加上
  「点这一行重试」这句。

## 测试

- `packages/ui/test/file-tree.test.ts`（+1）：带 `error` 的目录行留着、`aria-expanded="true"`、
  原因用危险色画出来、不挂 group。
- `packages/web/test/workspace-tree.test.ts`（+1）：失败的目录留着行、带着原因、标成未加载；
  已有列表的目录永远不带原因。
- `packages/web/test/workspace-tree-moves.test.ts`（+1）：原因跟着改名走（只共享前缀的兄弟不动），
  删掉一个条目时它的原因与它下面那些目录的也一起走。
- `packages/web/e2e/files-dir-error.spec.mjs`（新，2 条，真服务端 + 真浏览器）：① 打开之前就被删掉的
  目录 → 点它，原因画在仍在、仍展开的那一行下面，**过了七秒仍在**；把目录放回去再点一次，子行出现、
  原因消失；② 已经展开、子行在屏幕上的目录被删掉后点「刷新」→ 原因出现，旧的行不见了。

## 兼容性

已存状态、文件接口与线上格式都没变，服务端一句没改。
