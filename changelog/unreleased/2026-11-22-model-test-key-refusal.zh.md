# 连通性测试说「网络不通」，其实是密钥里混进了一个发不出去的字符

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `server`, `web`

[English](2026-11-22-model-test-key-refusal.md)

模型配置对话框里的「测试连通性」，在密钥里混进了中文、全角标点或看不见的字符时，给的是这么一句：

> 连通失败：Cannot convert argument to a ByteString because the character at index 67 has a value
> of 32416 which is greater than 255.

请求头只装得下 Latin-1，undici 因此拒绝了那一跳，而 SDK 把这个拒绝报成**retryable 的网络失败**
—— 于是对话框把一句「某个字符串第 67 位有个字符」原样递给了用户，既没说那是密钥，也没说往哪儿改。
读者会去查网络，真正要改的那一栏就在同一张表单里。

现在这半边的答案换成了一句能照着做的话：这把 key 里有一个字符进不了请求头，把密钥重新粘贴一次
（它若来自「用户密钥」，那边也核对一遍）。模型条目上的密钥、请求里的草稿、环境变量、以及轮换密钥的
解析器，四个来源都走同一句 —— 判的是那条消息，不是某一个字段。

## 细节

- `packages/server/src/services/project-config-service.ts`：新增导出函数 `headerRefusalCause(message)`
  —— 认出传输层自己的措辞（`Cannot convert argument to a ByteString`）就返回 `key_not_latin1`。
  `testModel` 的两处失败出口（流结束时的 `probeVerdict`、以及构造/迭代期间的兜底 catch）都过一遍
  它，命中就带上 `cause`。
- `packages/server/src/api/types.ts`：`ModelTestResponse.cause` 的联合类型加上 `key_not_latin1`。
- `packages/web/src/features/models/model-test-refusal.ts`：这个 cause 走 `testKeyNotLatin1`，
  不再把服务端那句英文递到按钮下面。
- `packages/web/src/lib/strings.ts` / `strings-en.ts`：新增 `models.testKeyNotLatin1`。

## 测试

- `packages/server/test/model-probe.test.ts`（+2）：传输层那句措辞认成 `key_not_latin1`；其余失败
  （`unexpected EOF`、`401 unauthorized`、`fetch failed`，以及只是提到「index」的别的句子）都不认。
- `packages/server/test/models.test.ts`（+1，真服务端 + 假 fetch）：`POST /models/test` 带一把
  第 60 位是「纠」的 key → `cause` 是 `key_not_latin1`、消息里留着原文，
  **并且一次请求都没发出去**（拒绝发生在 SDK 组装请求的那一步）。
- `packages/web/test/model-test-refusal.test.ts`（+1，并在语言那条里加一支）：这个 cause 出的是
  `testKeyNotLatin1`，且那句英文不再出现在返回的行里。

## 兼容性

只多了一个可选字段与一个新文案，请求、响应与已存配置都没变。
