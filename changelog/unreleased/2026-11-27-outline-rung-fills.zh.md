# 字底下的填充，不再取主题的描边色

- **Date:** 2026-11-27
- **Type:** fix
- **Scope:** `web`

[English](2026-11-27-outline-rung-fills.md)

从外观页导入的主题里，Tailwind 的 `bg-gray-200` 不是浅灰：调色板桥把这一档系在 `--ui-line`，
也就是主题的**描边**色上。手绘涂鸦的描边是 `#3f3a34`，旁边的墨是 `#332f2a`，于是每一处「拿这一档
当填充、上面压字」的控件都成了一块近乎全黑的底——模型选择器的活动分组实测对比度 **1.46**，轨迹面板
的文件标签、插件市场的分类选中项、提及 chip、未读角标与路径胶囊也是同样的形状。

这些控件现在都从主题自己的令牌取底色：该走表面档的用 `bg-fill-neutral`，坐在本来就是中性档的表面
上的用一层墨的薄涂（`bg-fg/10`、`bg-fg/7`）。拿灰阶当作字色的标签改成 `text-fg`，因为桥把深色模式的
`gray-200` 也指向描边色——当字色用时它是一层中等灰压在深底上。各处的 `dark:bg-gray-700` /
`dark:bg-gray-800` 一并去掉：令牌不需要明暗两份。

新增的守卫（`packages/web/test/outline-rung-fill.test.ts`）解析真实的 JSX，`bg-gray-200` 元素只要
带文字或表达式子节点就失败。无字的痕迹——进度槽、细线、网格缝、滚动条滑块——按文件列进例外并写明
理由；列了却不再出现的用法同样失败，所以例外表不会腐坏。

## 细节

- `packages/web/src/features/chat/model-picker-modal.tsx`——选择器左侧栏的活动厂商
  （`bg-gray-200/70 … dark:bg-gray-800` → `bg-fill-neutral`，去掉 `dark:bg-gray-800`）。
- `packages/web/src/features/plugins/plugins-page.tsx`——分类筛选的选中项。
- `packages/web/src/features/traces/trace-panel.tsx` 与 `sse-frame-list.tsx`——活动的轨迹文件
  标签、传输开关。
- `packages/web/src/features/company/channel-markdown.tsx`——不是读者本人的那个提及 chip（去掉
  深色的一半；字仍是 `text-gray-800` / `dark:text-gray-100`，桥在两种模式下都映到主题的墨）。
- `packages/web/src/features/company/channel-composer.tsx`——输入框透明文字层后面那层提及高亮
  （`bg-fg/10 ring-2 ring-fg/10`）。
- `packages/web/src/features/company/channel-sidebar.tsx`——频道行上的「加入」按钮，以及折叠侧栏上
  的未读计数（原来是 `bg-gray-300 text-gray-800`，也就是更深的 `--ui-line-emphasis` 压在它自己的墨上）。
- `packages/web/src/features/company/org-switcher.tsx`——悬停薄涂与未读 / 提及角标
  （`bg-fg/10 text-fg`）。
- `packages/web/src/features/company/path-capsule.tsx`——行内路径胶囊。
- `packages/web/src/features/company/shared.tsx`——成员头像（反色那一对：
  `bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900` → `bg-fg text-canvas`）。
- `packages/web/src/features/chat/goal-banner.tsx`——目标条上的状态标。
- `packages/web/src/features/terminal/terminal-appearance.ts`——标签页的关闭按钮与键帽的按下态。

## 兼容性

只改了类名。结构、请求、键盘路径与已存数据都没变，默认主题看起来和以前一样
（那边 `bg-fill-neutral` 是 `#f5f5f5`，原来那一档 70% 是 `#e9e9e9`）。
