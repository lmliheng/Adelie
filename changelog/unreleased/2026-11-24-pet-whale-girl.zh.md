# 桌宠形象的第二个就是鲸鱼娘 —— 你发的那张立绘现在自带

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

[English](2026-11-24-pet-whale-girl.md)

「设置 › 外观 › 桌宠形象」那一行的第二个选项，上一轮写的是「我的图片」：选它还得再挑一张图，
挑之前桌面上什么都没有（那行底下就写着「还没选图片，桌宠暂时还是企鹅」）。现在第二个选项本身
就是**鲸鱼娘**，选中她立刻出现在桌面上 —— 不用挑图，不用重启，也不用重开桌宠窗口。企鹅还是
第一个、还是默认；「我的图片」挪到了第三个，想换成自己的图照旧可以。

## 为什么改

上一轮把这两张立绘做成了「我的图片」那个上传位，用户要的不是那个：第二个选项应当叫鲸鱼娘，
点一下就是她。这一版把第一张立绘（毛线帽、鲸鱼毛衣）抠成透明底，直接随应用发出去。

## 细节

- `packages/web/public/pet-figures/whale-girl.png`：那张立绘透明底的 256 版，随前端产物一起发。
- `packages/web/src/features/pet/whale-girl.tsx`（新）：把这张图画进桌宠那一格 —— 页面给的同一个
  `className`、`object-contain`，并且不能拖（拖动是桌宠窗口自己的手势，交给浏览器就抢走了）。
- `packages/web/src/features/pet/figures.ts`：名字到画法的映射多一条 `whaleGirl`。
- `packages/web/src/lib/pet-figure.ts`：`PET_FIGURES` 变成 `["penguin", "whaleGirl", "picture"]`。
  存储里的名字用的是新的 `whaleGirl`，**没有**复用退休那条鱼留下的 `whale`：复用会把还存着
  `whale` 的桌面一起叫醒、无声换画；新形象就用新名字。
- `packages/web/src/lib/strings.ts` / `strings-en.ts`：选项名「鲸鱼娘」（英文 "Whale girl"），那一行
  的说明改成「经典企鹅、鲸鱼娘，或者你自己的图片」（英文 "the classic penguin, the whale girl,
  or a picture of your own"）。
- 没有新依赖、没有动接口；整个改动只多一个图片文件。

## 测试

- `packages/web/test/pet-figure.test.ts`：`whaleGirl` 画出来的是那张图（`src`、`object-contain`、
  `draggable="false"`、没有内联 SVG），并且存了 `whaleGirl` 的浏览器画她而不是企鹅；还留着「名字
  不再认识的形象退回企鹅」（用 `whale`）那条。
- `packages/web/e2e/pet-figure.spec.mjs`（真服务端 + 真浏览器，3 条）：新加一条 —— 另一个窗口写
  `penguin.petFigure=whaleGirl` 后，`/pet` 窗口不刷新就画上 `/pet-figures/whale-girl.png`，这张图真能
  解码（`naturalWidth > 0`），切回企鹅后图随之消失。
- `@adelie/web` 的 `tsc --noEmit`、`oxlint`、`prettier --check` 全过；全量单测通过。
- 在真浏览器里按桌宠窗口的真实尺寸（260×300）给三个形象各截了一张，放在仓库外的
  `pet-figures-shots/`。

## 兼容性

没有动路由、线上类型与存储键。存过 `picture` 的机器一个字没变；存过 `whale`（退休那条鱼）的机器
照旧退回企鹅 —— 这个名字这个版本仍然不认识。
