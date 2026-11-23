# 模型库的分组一律从折叠开始

- **日期：** 2026-11-24
- **类型：** fix
- **范围：** `web`

[English](2026-11-24-model-groups-start-collapsed.md)

模型库过去在首次访问时会展开目录里的第一个分组，用「导入模型」新建分组时也会顺手把它展开。
这两个都是用户没有做过的选择：排在第一的那个分组替「你大概想要的那一个」顶了一阵，目录长到
好几个分组之后就不再成立；导入时写下的那个偏好还会在这个 Project 的已存集合里一直留着。现在
所有分组一开始都是折叠的，唯一能展开一个分组的是用户自己点它。

## 细节

- `packages/web/src/features/models/model-group-expansion.ts`：`defaultExpandedProviders()`
  返回空集合，因此「这个 Project 什么都没存」「还没有 Project」「存储坏了」和「存了一个空数组」
  是同一个意思 —— 一个都不展开。已存集合的形状不变（每个 Project 一个 JSON 数组，装展开过的
  provider id）；搜索照旧临时展开含匹配的分组，不写存储。
- `packages/web/src/features/models/models-page.tsx`：导入落地不再为新分组写展开偏好（`importGroup`
  因此不再需要分组名 —— 连接由收集它的那个对话框写），导入出来的分组和其他分组一样是折叠着到的，
  要不要看由用户决定。
- 单测 `packages/web/test/model-group-expansion.test.ts` 跟着新默认值改；新增 e2e
  `packages/web/e2e/models-group-expansion.spec.mjs`（2 条）覆盖首次访问、键盘展开后重载、搜索，
  以及对着一个随机端口上的临时 provider 走一遍导入。

## 兼容

接口、已存数据、模型目录都没变。已经手动展开过分组的 Project 照旧展开着 —— 它的已存集合读法
一个字没改；只有从没展开过任何分组的 Project 现在停在全部折叠。
