# 内置浏览器「清除浏览数据」被拒时，原因留在卡片里

- **Date:** 2026-10-27
- **Type:** fix
- **Scope:** `web`, `docs`
- **Breaking:** no

[English](2026-10-27-builtin-clear-refusal.md)

内置浏览器的工具栏里有一个**清除浏览数据…**的确认卡：勾选要清掉的 Cookie、缓存、网站存储与历史
记录，再按**清除**。这张卡片本来就会在失败时留着（只有落地才收），但它的原因从不留在卡片里 ——
一条提示从天而降、几秒后自己走掉，而卡片照旧停在那儿，只说「选择要删除的数据」，不说这一次为什么
没删成。卡片上的重试是回到同一份勾选的唯一路径，可它旁边一个字都没有。

现在拒绝的话画在这张卡片里、就在卡片自己那句话下面，按的仍然是同一个**清除**按钮；勾好的种类
（连同取消勾选的那一个）原样留着，重试用的是同一份选择。

## 细节

- `packages/web/src/features/builtin-browser/clear-data-dialog.tsx`：新增 `refusal` 状态，接上
  `ConfirmModal` 的 `refusal` 槽（ui 包自带的那个槽，全 App 的确认框共用）；`catch` 不再
  `toastError`，改成把 `S.builtinBrowser.clearFailed(apiErrorText(err))` 交给卡片。每次点**清除**
  都先清掉上一次的原因（在飞的原因属于正在跑的这一次），每次开框也清一次 —— 重开的卡片不带上一次的
  话。成功路径没变：同一句 `toastSuccess`、同样收框。
- `packages/web/e2e/builtin-browser-clear-refusal.spec.mjs`（新，1 条）：内置浏览器只在桌面壳里跑，
  所以用例把 App 唯一问桌面壳的那件事（自定义元素表里的 `webview`）与三条浏览器路由在页面里打桩，
  服务端、登录与 Project 都是真的。用 500（`clear_data_refused`，一个没有翻译的码，屏幕上那句话只
  可能来自探针）拒一次：卡片留着、原因在卡片里、取消勾选的「历史记录」还是没勾、其余三个还勾着，
  并且**发出去的那个请求体里没有 `history`**；放行后同一个按钮再点一次，卡片收起，重试发出的种类与
  被拒的那一次相同。
- 文档：`packages/docs/content/builtin-browser.{zh,en}.md` 的「清除浏览数据」一节加一句。

## 兼容性

- 不改依赖、不改接口、不改磁盘格式与协议：仍是同一个 `POST /api/builtin-browser/clear-data`（与
  `DELETE …/history`），服务端一行没动；文案沿用已有的 `clearFailed`，没有新字符串。
