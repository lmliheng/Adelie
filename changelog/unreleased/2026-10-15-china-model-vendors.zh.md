# 新增四家国内模型商：小米、百度、腾讯、讯飞

- **Date:** 2026-10-15
- **Type:** feat
- **Scope:** `core`

[English](2026-10-15-china-model-vendors.md)

模型页多了四个预置分组，每组都带着厂商自己的模型与端点——贴一把 key 就能用，不必再手填 base URL：

| 分组 | 模型 | 端点 |
| --- | --- | --- |
| 小米 MiMo | `mimo-v2.6-pro`、`mimo-v2.6-flash`（均 1M 上下文、支持图片输入） | `https://api.xiaomimimo.com/v1` |
| 百度文心 ERNIE | `ernie-5.1`、`ernie-5.0`、`ernie-4.5-turbo-vl`、`ernie-4.5-turbo-128k`、`ernie-x1.1` | `https://qianfan.baidubce.com/v2`（千帆的 OpenAI 兼容路径是 `/v2`，`/v1` 已下线） |
| 腾讯混元 | `hunyuan-a13b`、`hunyuan-vision-1.5-instruct`、`hunyuan-t1-vision-20250916`、`hunyuan-turbos-vision-video` | `https://api.hunyuan.cloud.tencent.com/v1` |
| 讯飞星火 | `4.0Ultra`、`pro-128k`、`lite` | `https://spark-api-open.xf-yun.com/v1` |

每个分组都链到各自的控制台（建 key 的那一页）与模型清单；每一行记下厂商公布的东西——上下文窗口、
是否吃图片、以及按目录惯例 7:1 折算成美元的价格（厂商原本是人民币）。这四家 AgentHub 都没有一方
客户端，所以每行都钉住 Chat Completions 协议并内联端点——与 ModelScope、vLLM 现有的写法一致。

厂商文档本身讲不清的地方，目录里如实写出来、而不是替它补齐：讯飞那几行不带价格（`4.0Ultra`、
`pro-128k`）或用它自己公布的免费价（`lite`）——它的 HTTP 文档没有价格表，产品页的价格又只按它没公布
过 API id 的 X2.5 系列列出；星火的 Max 一对也没收录（官方写明这两个套餐 2026-03-10 下线）。腾讯这条
线正在迁往 TokenHub，控制台链接取的是它今天文档里那一个；角色扮演 / 翻译 / 向量化三类偏单用途的行没进
预置。小米的 `mimo-v2.6-pro-ultraspeed` 同样没收：它的模型页没有能力列，窗口与图片支持都读不出来。
