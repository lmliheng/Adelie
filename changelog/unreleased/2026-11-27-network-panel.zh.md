# 对话页多了「网络」面板：每一回合到底发了哪些请求

- **Date:** 2026-11-27
- **Type:** feat
- **Scope:** `web`

[English](2026-11-27-network-panel.md)

对话页的停靠区多了一个常驻的**网络**标签，和子代理、文件、记忆、轨迹、日程并列。它记录这一页发出的
请求——不用先打开什么开关，也不往服务端传一个字：列表只在本页内存里，刷新即清空。

列表按回合分组、最新的在上，每行是时间、方法、状态、路径、帧数和耗时；失败的标红，重试过的带 `×n`，
慢请求有标签，进行中的那行有脉冲点。工具条能切范围（本次回复 / 最近 5 回合 / 全部）、按类型筛选
（接口 / 模型 / 流 / 上传），并按路径、状态码或模型搜。点一行就在**面板内**打开详情（← 返回列表），
标签有概述（时间分解）、请求、响应、事件流，以及这一回合的其它请求。

助手回复的页脚多了 `⚡ N 个请求 · M 次模型调用 · 耗时`，点它打开面板并定位到那一回合；面板菜单里可以
把这行关掉。设置 › 系统新加「网络记录」一节：保留条数、记录什么、脱敏说明，以及清空和导出。

## 细节

- `packages/web/src/api/net-log.ts`（新）：记录器。环形保留 300 条，响应体每条最多 64 KB（超出标
  「已截断」），每条带上会话、当前回合和请求号。模型调用从流的 `request_begin` / `request_end` 事件
  读出来，作为该回合的子行——模型调用发生在服务端，流是页面唯一看得见它的地方。密钥默认遮罩：
  `authorization`、`cookie`、`set-cookie`、`x-api-key`，以及名字里带 `*token*` / `*secret*` /
  `*password*` 的；URL 参数 `key` / `token` / `api_key` / `access_token`；JSON 字段按同名字段匹配。
  要看原文要二次确认，且只对当前那一条生效。
- 插桩在 API 自己的出口上——`api/client.ts` 的 `apiFetch` / `apiFetchWithMeta` / `apiFetchStream`
  与上传那支 XHR——**不挂全局 `window.fetch`**。`api/sse.ts` 的两条 SSE 订阅每次连接开一行、数页面收到
  的帧；帧本身仍走原来的 `api/sse-frames.ts`，所以详情里的事件流与轨迹面板看到的是同一批帧。
- `packages/web/src/features/network/`（新）：`network-panel.tsx`（工具条、列表、详情）、`net-rows.ts`
  （分组、筛选、汇总数字）、`net-inline-row.tsx`（回复下那行）、`net-export.ts`（导出 JSON，出口再遮
  一次）、`net-focus.ts`（把面板打开到某一回合）。
- 标签在 `features/chat/builtin-dock-panels.tsx` 注册；内联行由 `message-item.tsx` /
  `message-stream.tsx` 画出；设置那节是 `features/settings/network-section.tsx`（经
  `lib/settings-sections.ts` 挂进「系统」）；面板偏好（条数、内联行、慢请求高亮）存在本浏览器的
  `localStorage`。

## 兼容性

记录不出这一页，只有面板会读它。服务端一字未动、没有新接口：面板显示的都是页面本来就在发的请求、本来就
在读的流。事件流里「服务端写出」的半个是目前写着「未采集」的占位，等写入侧有采集点再补。
