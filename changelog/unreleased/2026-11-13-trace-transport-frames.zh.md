# 轨迹面板里能看到本浏览器实际收到的实时帧

- **Date:** 2026-11-13
- **Type:** feature
- **Scope:** `web`

[English](2026-11-13-trace-transport-frames.md)

实时对话安静下来时，光从浏览器这边分不清是数据不再送达，还是服务端不再写：帧一送到就没了，刷新页面换来的又是
另一条连接。

轨迹面板现在多了一个**传输**视图，默认就在记录。它列出本浏览器收到的 SSE 帧 —— 新的在上，每行给出事件名、
通道给的 id、字节数和载荷开头 —— 外加连接自己的标记（`open` / `reopen` / `stalled` / `live` / `probe` /
`error` / `closed`），以及超过心跳间隔的静默标记（标出静默了多久）。它不需要先被打开：流停了是事后才发现的，
而从打开开关那一刻才开始录的帧，恰恰就是已经错过的那批。不想要它的人可以关掉，选择记在浏览器里。

## 细节

- `packages/web/src/api/sse-frames.ts`：页面级环形缓冲（300 条，最旧的先出），由 `api/sse.ts` 在每收到一帧时写入。
  默认记录，只有被关掉时才不记（键是 `penguin.sseFrames`，关掉时写 `0`）；关掉时把已收集的清掉 —— 一份冻在
  屏幕上的列表会被读成流停了。相邻且间隔不到十秒的同一个标记会合并成一条，否则一个不断重试死连接的浏览器会把
  环形缓冲冲掉。
- `packages/web/src/features/traces/sse-frame-list.tsx`：这个视图本身 —— 开关、计数、清空按钮和每一行 ——
  只在自己的停靠页显示时跟着记录器的通知重绘。
- `packages/web/src/features/traces/transport-rows.ts`：本 Session 的面板显示哪些条目（它自己的通道加上页面那条
  用户级流，后者带标记），新的在上，最多 120 行。
- `packages/web/src/features/traces/trace-panel.tsx`：视图画在文件药丸上方，并且在**每一种**列表状态下都在 ——
  加载中、加载失败、以及这个会话还没有任何 Trace 文件（「暂无轨迹」）时都在。最后那种正是要问「实时流到底
  有没有送来东西」的时刻。
- `packages/web/src/lib/format.ts`：`formatTime` 也接受毫秒时间戳，现场的记录不必绕一圈 ISO 文本才能打印自己的钟。

## 测试

- `packages/web/test/sse-frames.test.ts`：默认就记录、关掉时清空且不再记；最近 300 条留下；超过心跳间隔的静默留下
  一条带时长的标记，而刚好等于间隔的那次不留；相同标记合并、帧从不合并；订阅者一直被通知到退出为止；字节数按
  UTF-8 计算、预览有长度上限。
- `packages/web/test/sse.test.ts`：帧从订阅处进入记录器，带着事件名、id 和字节数。
- `packages/web/test/transport-rows.test.ts`、`packages/web/test/sse-frame-list.test.ts`：行的取舍、顺序与上限；
  以及渲染出来的内容 —— 默认就在记录，行里是协议自己的字眼，别的 Session 的通道不出现。
- `packages/web/test/trace-panel.test.ts`：面板外壳 —— 列表还在加载时传输视图已经画出来，会话没有被选中时也画。

## 兼容性

线上协议没变、没有新依赖、Project 配置没变。它默认记录，但只留在当前页面的内存里，从不写进存储、也不发往别处；
不想要它的人关掉即可，看到的还是原来那块面板。这个视图只记录收到的那一半：服务端写了什么在浏览器这边看不见，
它也不声称自己能看到。
