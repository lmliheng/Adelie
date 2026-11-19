# 自建分组的模型没填服务地址时，连通性测试立刻说清少了什么，不再干等 20 秒只回一句英文

- **Date:** 2026-11-20
- **Type:** fix
- **Scope:** `server`, `web`

[English](2026-11-20-model-test-no-endpoint.md)

vLLM、Custom 以及用户自建的分组都**不预设服务地址**：地址写在每条模型条目上。于是在这些分组里，
只填了一把 key、base URL 留空，点「测试连通性」会走成这样 —— 探针没有地址可去，SDK 就用了它自己
的默认端点（OpenAI 协议的 row 就是 `api.openai.com`），在那里把 20 秒超时跑满，最后返回一句英文的
原始网络错误：`连通失败：Connection error.: fetch failed: AggregateError (ETIMEDOUT)`。用户看到的是
"连接错误"，看不出真正缺的是地址。

现在服务端在**拨号之前**就认出这件事：草稿、已存条目、分组的预设端点、环境变量，四处都没有地址，
直接返回一个可读的原因（`cause: "no_endpoint"`），对话框用自己的话说明白 ——
「连通失败：这个分组是自建的，没有现成的服务地址 —— 先把你自己服务的 base URL 填上再测。」

## 细节

- `packages/server/src/services/project-config-service.ts` 的 `testModel`：在构造客户端之前多一步
  判断 —— 草稿与已存条目都没有 base URL（`baseUrl: null` 表示「界面上已清空」，按清空算）、分组
  自己没有预设端点（`gatewayBaseUrl`）、环境里那个 `*_BASE_URL` 也没值（探针本来会自己读它），并且
  这条模型确实有协议可用（显式 `client_type`，或分组钉下的协议，如 vLLM 的
  `openai-chat-vllm-adapter`）—— 就返回 `{ ok: false, cause: "no_endpoint", message: … }`，一句话
  点名缺的是地址。
- 三类分组不受影响，因为它们没有地址也**确实有地方可去**：厂商分组（routed client 的默认端点就是
  该厂商自己的）、网关（端点由分组预设）、以及在条目上内联了地址的分组（如小米）。协议都没得用的
  条目也放过 —— 那时 SDK 自己那句 `is not supported. Supported client types: …` 才是对的话。
- `packages/server/src/api/types.ts`：`ModelTestResponse` 多一个可选 `cause?: "no_endpoint"`。给人看
  的那句话由界面写（两种语言），接口只给机器可读的原因。
- `packages/web/src/features/models/model-test-refusal.ts`：按钮下面那行对这个原因用自己的文案
  （`strings.ts` / `strings-en.ts` 的 `models.testNoEndpoint`），不再回放服务器那句英文。

## 测试

- 探针（用工作树里新构建的 server 起临时实例 + 仓库自带假模型，端口 8966/8933）：
  - 改前：vLLM 只填 key、不填地址 → `200 (2143ms) {"ok":false,"message":"Connection error.: fetch
    failed: AggregateError (ETIMEDOUT)"}`；custom 与用户自建分组同样 2000ms 出头、同一句英文。
  - 改后：同样三种输入 → `200 (12–16ms) {"ok":false,"cause":"no_endpoint","message":"Model
    vllm/Qwen/Qwen3.5-9B has no base URL, and its group has none of its own: …"}`。
  - 反向对照未变：填了地址 → `ok:true`（76ms 通，latencyMs 61）；填了地址不填 key → 仍是凭据那条拒绝；
    厂商分组（deepseek）没有地址 → 照旧真拨号，拿回上游的 401。
- `packages/server/test/models.test.ts`：新增两条 —— 自建分组（vLLM / custom / 用户自建）三种输入、
  两种写法（省略地址与 `baseUrl: null`）都必须返回 `cause: "no_endpoint"` 且**一个请求都没发出去**；
  厂商分组、网关、内联地址的分组照旧拨号、不带这个原因。另两条既有用例补上 base URL，让它们继续
  测各自要测的东西（凭据规则、clearApiKey 不回退已存的 key）。
- `packages/web/test/model-test-refusal.test.ts`：新增一条（这个原因走界面自己的句子、不回放英文），
  并在「跟着语言走」那条里补上英文断言。server 模型相关 6 个文件 / 71 条、web 相关 5 个文件 / 56 条全过。
- server 与 web 的 `tsc --noEmit` 通过；改动文件 `oxlint` 0 警告 0 错误、`prettier --check` 干净；
  前端产物（`vite build`）里确认两句新文案都已进包。

## 兼容性

接口多了一个可选字段（老的客户端忽略它即可），配置格式、已存数据、CLI 都没动。行为上有一处收紧：
自建分组里**填了 key 却没填地址**的测试探针，以前会真的去拨协议默认端点、20 秒后回一句网络错误，
现在立刻返回「缺地址」。这是探针（只测连通性、不落盘）的行为，不影响已保存配置的正常请求路径。
