# 输入框拒掉过大的文件时，原因留在输入框上方，不再只是一条六秒通知

- **Date:** 2026-11-21
- **Type:** fix
- **Scope:** `web`

[English](2026-11-21-attachment-refusal.md)

在输入框里挑一张图、一段视频或一个文件，超过上限的那个会被**读之前**就拒掉：没有 chip、什么都没
加进草稿。这时屏幕上唯一的说明是一条盖在页面顶部的通知，六秒后自己走掉 —— 六秒之后 chip 行里只是
少了一个文件，再没有一个字说得出是哪个文件、上限是多少（7.19 的规矩：句子留在尝试发生的地方，而
挑选器就在一次点击之外）。

现在原因画在输入卡上方、整排拒绝句的最前面（`role="alert"`、`data-testid="attachment-refusal"`、
危险色、两行、整句挂悬停），留到**下一次**挑选 / 粘贴 / 拖放为止 —— 不靠计时器消失。

## 细节

三个上限是三个数：内联图片 20MB、内联视频 32MB 是编译进服务端的常量，文件附件走管理员可设的
单文件上限。一次操作因此可能同时越过两个上限，所以句子按**上限**分组，每一组写下被它拒掉的文件：

- `packages/web/src/features/chat/attachment-refusal.ts`（新）：`attachmentRefusalLine(rejected)` ——
  空列表返回 `null`（同时是「清掉上一句」），否则按上限分组、保持挑选顺序、每组一句。
- `packages/web/src/lib/strings.ts` / `strings-en.ts`：`chat.attachmentTooLarge` 改成按「一组文件名 +
  上限」出句，列表分隔符由各词典自己决定（中文 `、`、英文 `, `，与仓里其它列名一致；英文按单复数
  在 `exceeds/exceed`、`was/were` 之间选）。
- `packages/web/src/features/chat/chat-input.tsx`：三条 intake（图片 / 视频 / 附件）与两条入口
  （「+」菜单的两个挑选器、粘贴、拖放）都改成「**先算出被拒的清单，再统一写成一行**」——
  一次拖放里同时有超限的图和超限的视频时，得到一行两句，而不是后一条盖掉前一条。原来的三处
  `toastError` 删掉（这个文件不再用通知说拒绝）。

## 测试

- `packages/web/test/attachment-refusal.test.ts`（新，5 条）：空清单得到 `null`；单个文件得到一句；
  同一上限的一批文件合成一句、名字按挑选顺序用 `、` 连接；两个上限得到两句（按首次出现的顺序）；
  换成英文时句子与分隔符都跟着换（`、` 不再出现）。
- `packages/web/e2e/attachment-refusal.spec.mjs`（新，2 条，真服务端 + 真浏览器）：
  ① 挑一张 21MB 的图 → 输入卡上方一句「shot.png 超过 20MB 上限，未添加。」、通知区没有它、
  没有 chip、草稿没变；**过了七秒仍在**；再挑一张 1MB 的图 → 句子消失、chip 出现；
  ② 拖放三个文件（21MB 图 + 33MB 片段 + 1KB 文本，真 `DragEvent` + `DataTransfer`）→ 一行两句、
  各说各的上限，通知区没有一句、`notes.txt` 照常进了 chip 行。
- **反证**：同一份 spec 挂改前产物（`r281/before-dist`，主包 `index-*.js` 里没有
  `attachment-refusal`）→ **2 条全红**（找不到 `data-testid="attachment-refusal"`）。
- **两态探针**（同一脚本两条腿，各自挂自己的产物）：改前 1 秒时那句话在通知区（通知区正是那句），
  8 秒后通知区空、输入卡上方 0 条；改后 1 秒与 8 秒都是输入卡上方 1 条、通知区空。

## 兼容性

只动前端渲染：接口、线上格式与已存数据都没变，服务端一句没改；三个上限的数值与判定 `>` 的规则不变。
