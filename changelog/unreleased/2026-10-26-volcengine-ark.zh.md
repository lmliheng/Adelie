# 模型库里多了字节跳动的火山方舟，豆包 Seed 可以直接选

- **Date:** 2026-10-26
- **Type:** feat
- **Scope:** `core`, `web`, `ui`, `docs`
- **Breaking:** no

[English](2026-10-26-volcengine-ark.md)

**模型库**页面多了一个 Volcengine Ark 分组，排在讯飞之后。它收录的是字节跳动自家模型平台火山方舟
（Volcengine Ark）上的 11 个模型：豆包 Seed 七条，加上方舟转售的 GLM、Kimi、DeepSeek 四条。已有的项目点一次
**同步预置**就有，新建的项目直接带着。

整个分组只有一个 OpenAI 兼容端点 `https://ark.cn-beijing.volces.com/api/v3`，把方舟控制台的 API key 填进
分组标题栏就完事：不用挑协议，也不用填端点。11 条里有七条接受视频输入（豆包 Seed 六条，加方舟转售的
GLM-5.3-Flash），卡片上会标**视频**。

## 细节

- **11 个条目**（`core/src/state/model-catalog.ts`）：`doubao-seed-evolving`、`doubao-seed-2-1-pro-260915`、
  `doubao-seed-2-1-lite-260915`、`doubao-seed-2-1-turbo-260628`、`doubao-seed-2-0-lite-260428`、
  `doubao-seed-2-0-mini-260428`、`doubao-seed-character-260628`，以及 `glm-5-3-flash-260828`、
  `kimi-k3-1-pro-261024`、`deepseek-v4-1-flash-261017`、`deepseek-v4-pro-ga-260813`。窗口、模态与价格读自方舟
  官网的模型列表与定价页（2026-10-25），人民币按 7:1 折成目录里的美元存储；方舟按输入长度分档计价，只记基础档。
  `deepseek-v4-1-flash-261017` 的峰谷价与 DeepSeek 自家那套一致，复用同一份空闲时段规则。
- **协议与凭证**：方舟没有对应的 AgentHub 客户端，所以每个条目都固定 Chat Completions（`openai-chat`）并把端点
  写在条目上；没有 key 的条目会被拒绝，而不是把 `OPENAI_API_KEY` 发给它。
- **视频输入**：`ModelCatalogEntry` 新增 `supportsVideo`（默认**不支持**，只有 `true` 才写），目录里七条
  带这个标记（豆包 Seed 六条与 `glm-5-3-flash-260828`）；模型列表把它报成 `video`，对话输入框据此决定视频是
  内联发给模型还是落成文件（见下一条变更）。
- **品牌标**：`packages/ui` 的 provider logo 补上火山方舟与 Abliteration 两个真标（分别取自两家官网，压成
  单色，丢弃字标与底板），模型库、模型选择器里不再显示字母牌。
- 文档：`packages/docs/content/models.zh.md` 与 `models.en.md` 的分组表各一行、各一节，预置模型表补一行，
  「视频」这个卡片标签也写进去。
- 测试：`core/test/model-catalog.test.ts`（分组顺序、网关集合、带端点预置清单、错峰行清单）、
  `web/test/model-grouping.test.ts`（分组默认顺序）。

## 兼容性

- 没有依赖变化，也没重写已存数据：老项目自己的条目原样保留，点一次**同步预置**才会把这十一条补进来。
- 会话只有在你把某个 Session 换成这些模型时才会用到方舟端点；已有会话的模型不变。
