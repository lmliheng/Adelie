# Four more first-party model vendors: Xiaomi, Baidu, Tencent and iFlytek

- **Date:** 2026-10-15
- **Type:** feat
- **Scope:** `core`

[中文版](2026-10-15-china-model-vendors.zh.md)

The Models page gains four preset groups, each carrying that vendor's own models and endpoint, so
their models can be used by pasting a key instead of filling in an endpoint by hand:

| Group | Models | Endpoint |
| --- | --- | --- |
| Xiaomi MiMo | `mimo-v2.6-pro`, `mimo-v2.6-flash` (both 1M context, image input) | `https://api.xiaomimimo.com/v1` |
| Baidu ERNIE | `ernie-5.1`, `ernie-5.0`, `ernie-4.5-turbo-vl`, `ernie-4.5-turbo-128k`, `ernie-x1.1` | `https://qianfan.baidubce.com/v2` (Qianfan's OpenAI-compatible base is `/v2`; `/v1` is retired) |
| Tencent Hunyuan | `hunyuan-a13b`, `hunyuan-vision-1.5-instruct`, `hunyuan-t1-vision-20250916`, `hunyuan-turbos-vision-video` | `https://api.hunyuan.cloud.tencent.com/v1` |
| iFlytek Spark | `4.0Ultra`, `pro-128k`, `lite` | `https://spark-api-open.xf-yun.com/v1` |

Every group links its own console (where the key is created) and its model list, and every row
records what the vendor publishes: context window, image input, and the price converted from the
vendor's CNY list at the catalog's usual 7:1 rate. AgentHub has no first-party client for any of
the four, so each row pins the Chat Completions protocol and inlines the endpoint — the same shape
the ModelScope and vLLM rows already use.

Where the vendors' own documentation is thin, the catalog says so instead of filling the gap:
iFlytek's rows carry no price (`4.0Ultra`, `pro-128k`) or the free rate it publishes (`lite`),
because its HTTP doc has no price list and its product page prices model families it has published
no API id for; Spark's Max pair is left out (Spark dates those plans offline on 2026-03-10).
Tencent is migrating this platform to TokenHub, so its console link is the one today's docs name,
and the role-play / translation / embedding rows are left out as single-purpose. Xiaomi's
`mimo-v2.6-pro-ultraspeed` is left out too: its model page carries no capability column, so neither
a window nor vision support could be read from it.
