# 输入框的 / 命令菜单：长说明不再被截掉，也不再盖住下一行

- **Date:** 2026-11-15
- **Type:** fix
- **Scope:** `ui`

[English](2026-11-15-slash-menu-roomier.md)

在输入框里打一个 `/` 会列出命令和已装的技能。列表里那些说明是**句子**（「以正确数据语义完成产物并进行
有界核查。」），而面板原先只有 320px 宽、说明只占一行 —— 于是绝大多数条目只剩半句加一个省略号，
`/penguin-orchestration` 这种长名字更是把说明挤到十来个字。想看清楚就得悬停，而悬停弹出的浮层正好
压住下面几行 —— 你要挑的那几行。

现在面板宽到 416px，说明先用**第二行**，还放不下才省略。24 条命令逐条量过：没有一条再从中间被切掉
（改动前 24 条里有 16 条被切），最长的几条也在两行内排完，悬停浮层因此不再弹出。

## 细节

- `packages/ui/src/components/chat/composer/composer.tsx`：面板 `w-80` → `w-[26rem]`（窄屏仍由
  `max-w-[calc(100vw-2rem)]` 兜底）；说明那一格由 `truncate` 改成 `line-clamp-2 break-words`，
  行距收到 `leading-snug`。
- 命令那一格加了 `max-w-[60%]`：技能名字由用户自己起，理论上可以长过整行；超了就让命令自己省略
  （不是把说明挤没），整串仍在 DOM 里，悬停时照旧能看全。
- 让说明换行而不是靠浮层，是有意的取舍：说明是给人读的，而浮层在这个菜单里会盖住下面的候选行。

## 测试

- `packages/ui/test/composer.test.ts`：面板宽度、说明的两行截断、命令那一格的上限与省略。
- 真浏览器量过：改动前 320px 面板下 `clientWidth/scrollWidth` 多为 `174/228`、`118/395`、`110/261`
  （被切）；改动后 24 行全部 `clientWidth === scrollWidth`、`scrollHeight === clientHeight`，
  悬停 `/agent-initialization` 不再出现浮层。

## 兼容性

只有样式与一个上限属性，没有新的 props、没有行为变化。
