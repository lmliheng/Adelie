# 底部停靠栏不再盖住输入区

- **Date:** 2026-10-27
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[English](2026-10-27-dock-composer-overlap.md)

底部停靠栏（以及窄屏下合并成的底部停靠面）在停靠状态下拉到最大时，现在停在输入区上方。此前它最高
可占对话列（含工具行）的 85%，多数窗口里留给输入区的高度不够：输入区被压到停靠栏下面、点不到，设了
壁纸时两者还会互相透出来。

停靠状态的最大高度给输入区留出完整高度，并在其上留一条消息带，容得下快捷方式悬浮球及其小字和回到底部
按钮。输入区变高（多行输入、附件、提示条）或窗口变矮时，停靠栏即时让出，空间回来后再恢复，记住的高度
不变。窗口很矮时先让出消息带，再让出停靠栏自身的最小高度，输入区始终完整。拖动边界停在新的最大值，
记住的是停靠栏显示出来的高度，越过最大值照旧跳变为全屏。全屏仍然盖住输入区。

## 细节

- `packages/web/src/features/dock/bottom-dock-size.ts`（新增，纯逻辑）：规则本身 ——
  `bottomDockMaxHeight` 是工具行以下那片区域扣掉输入区与一条消息带
  （`CONVERSATION_MIN_HEIGHT_PX`，取悬浮球自己「最短的完整身子」那个数）之后剩下的高度，仍受所存比例
  的 `DOCK_RATIO_MAX` 封顶；`bottomDockHeight` 把所存比例夹到它以内。尺寸常量一并搬到这里，
  `dock-state.ts` 反过来从这里取 `DOCK_RATIO_MAX`。
- `packages/web/src/features/dock/composer-height.ts`（新增）：一个 `ResizeObserver` 喂的小 store，
  让停靠栏、它的拖动夹取与拖动浮层的落点预览读同一个输入区高度；最后一次测量在重挂载后仍然留着，
  切会话时重建输入区不会让已经到顶的停靠栏先跳上去再落下来。
- `packages/web/src/features/dock/dock-panel.tsx`：量出对话列与那片区域（`[data-dock-host]` /
  `[data-dock-area]`），用新函数决定画多高；上限跌破停靠栏高度时在同一个提交里让出（走既有的
  `snap` 路径），不经过主题的布局动画。
- `packages/web/src/features/dock/dock-drag.tsx`：落点预览用同一个函数。
- `packages/web/src/features/chat/chat-page.tsx`：输入区那个框挂上测量 ref。本树的输入区是一个普通
  `<div>` —— 上游把 ref 交给它的壁纸面，而本树没有那个组件。
- `packages/web/e2e/dock.spec.mjs`：「尺寸与排布在刷新后仍在」这条改在 1280×1100 下跑；默认的
  1280×720 下底部停靠栏的默认高度已经到了新上限，那条往上拖的用例就没有生长空间了。
- 移植自上游 `bf3395ff`（#1325），照改动落、不是合分支；`test/bottom-dock-size.test.ts` 里那条读源码
  的用例按本树的输入区结构改了一处。

## 兼容性

- 不改依赖、不改已存数据、不改包名与配置格式。已存的比例（最高 0.85）直接按新上限画出来，下一次拖动
  记住的是停靠栏显示出来的高度。
