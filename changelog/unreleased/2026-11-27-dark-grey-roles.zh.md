# 外置主题的深色灰阶：200 是字色，深色填充要落在填充 token 上

- **Date:** 2026-11-27
- **Type:** fix
- **Scope:** `core`, `web`

[English](2026-11-27-dark-grey-roles.md)

外置主题（外观页「主题库」里按需取用的那几套，比如手绘涂鸦）是取值而不是 css：它跟 Tailwind 灰阶对不上的那一层由 core 的 `internal/external-theme.ts` 用主题自己的 token 写成桥。那层桥有两个灰档的角色与内置主题不一致。

`--color-gray-200` 原来接到 `--ui-line` —— 主题的**描边色**。两套内置主题的深色档都把它当字色，比正文字色低一档（`github.css` 是 `#c2c2c2`，`geek.css` 是 `#c5c0bf`），应用里每一处 `dark:text-gray-200` 也是这么读的 —— 占位符 token 的名字、标签页的名字、工单的负责人。接成描边色之后，这些字在外置主题下就是描边的颜色：落在普通底色上大约 2:1，而落在一个 `dark:bg-gray-800` 的 chip 里（同一个 token）就是字与底**同一个颜色**。手绘涂鸦深色下，Agent「可用占位符」那些 chip 看上去是几个空方块（实测字色与底色都是 `rgb(122 109 94)`，对比度 **1.00**），现在是 **11.0**。

深色填充是另一半。`dark:bg-gray-700/800` 也是那道描边档，于是一个在内置主题里是近黑方块的 chip，在描边是一条粗手绘线的主题里变成一块中间调的色块，压在上面的次级字色只有 **2.71:1**。这些调用点现在用 `dark:bg-fill-neutral` 填充 —— 那是主题里表示「填充」的 token：同一主题下到 6.05，内置主题里与原来同色。

## 细节

- `packages/core/src/internal/external-theme.ts`：`PALETTE_BRIDGE_DARK` 把 `--color-gray-200` 接到 `--ui-fg`，并写明理由（两套内置深色档都把它当字色；应用里有 41 处 `dark:text-gray-200`，其中一处就压在同一个灰档填充的 chip 上）。
- `packages/core/test/external-theme.test.ts`：深色桥那一行，以及「只桥主题声明了的档」那条（200 现在跟着字色走，所以声明了 `--ui-fg` 的主题在深色下也带着它）。
- `packages/web`：带字的深色填充改用 `dark:bg-fill-neutral` —— 插件页的标签、插件详情的关键词标签与安装说明、Agent 的占位符 chip（提示词 / 记忆 / 注入）、模型选择器的高亮行、步骤序号圆、公司落地页的图标圆、语义 id 的前缀、轨迹事件的两块代码、时间线的任务 chip、桌宠的气泡与控制按钮；`lib/tone.ts` 的灰档（`toneSurface.muted`）改成 `bg-fill-neutral text-fg-muted`。
- `packages/web/test/outline-rung-fill.test.ts`：描边守卫多了「深色灰档填充 + 灰阶字色」这一对（就是塌成一色的那种写法）。三个只是看着带字的容器（分段控件的缝隙、进度条轨道、图表轨道）保留填充，名字写在守卫的注释里。

## 兼容

接口、数据、文案都没有改动，没有新依赖。内置主题的画法不变（它们的深色档里 `fill-neutral` 本来就是 `gray-800`），外置主题下的字变得可读。依赖 `dark:border-gray-200` / `dark:bg-gray-200` 的主题现在拿到的是字色的描边或标记 —— 这正是内置主题里早就显示的样子。
