# TokenDance 分组补齐新模型，价格与促销按卖家当下的目录重核

- **Date:** 2026-10-27
- **Type:** fix
- **Scope:** `core`, `docs`
- **Breaking:** no

[English](2026-10-27-tokendance-catalog-refresh.md)

**模型库**里 TokenDance 分组多出四条模型：DeepSeek V4.1 Flash 1017、DeepSeek V4 Pro Preview、
Kimi K3.1 Pro、GLM-5.3 FlashX。同时把这一组全部 18 条的价格、上下文窗口与促销重核了一遍（上一次核对是
2026-09-16，其中几条的价格已经变了）：已有项目点一次**同步预置**就拿到新条目与更正后的价格，新建项目直接带着。

## 细节

- **四条新条目**（`core/src/state/model-catalog.ts`）：
  - `deepseek-v4.1-flash-1017` —— 卖家目录里写明 V4.1 Flash 的 DeepSeek 端点已升级到 1017 版本，
    这只是同价的独立 id：100 万窗口、可读图，牌价 ¥2 / ¥8 每百万（命中缓存 ¥0.04），峰时 8 折、
    谷时按牌价一半。它与 `deepseek-v4.1-flash` 都改用「峰时实际计费价 + DeepSeek 空闲时段」的写法，
    两个档位因此都与网关实收一致。
  - `deepseek-v4-pro` —— 同一条 V4 Pro 的未带日期 id，104.8576 万窗口、纯文本，牌价 ¥9 / ¥27
    （缓存 ¥0.3）打 9 折，没有峰谷时段。
  - `kimi-k3.1-pro` —— Moonshot K3.1 系列首个模型、卖家当前最大的一个：100 万窗口、可读图与视频，
    无促销，¥13 / ¥68（缓存 ¥1.3）。
  - `glm-5.3-flashx` —— GLM-5.3 Flash 的同代兄弟，100 万窗口、可读图，无促销，¥2 / ¥7（缓存 ¥0.57）。
- **更正**：`kimi-k3` 的 6 折、`deepseek-v4-flash-0731` 与 `deepseek-v4-pro-0813` 的 9 折都已停止，
  三条的价格改记卖家的当前牌价，去掉促销字段；`seed-evolving` 的窗口从 25.6 万改为 100 万；
  两条老 DeepSeek 条目改按 DeepSeek 的空闲时段计费（谷时 ¥1.5 / ¥4.5 与 ¥4.5 / ¥13.5）。
- **一处只能近似，已写进代码与文档**：`deepseek-v4-flash-0731` 与 `deepseek-v4-pro-0813` 的峰时费率是
  促销后的价（牌价省 20%），谷时网关按**牌价**的一半收，而一条记录只放得下一个费率（`discount` 与
  `offPeakDiscount` 互斥）。两条因此记峰时实收、谷时按它减半，谷时估算比网关实收低 20%；峰时精确。
  `deepseek-v4.1-flash` 与 `deepseek-v4.1-flash-1017` 两个档位打同一个促销，减半正好吻合。
- **数据来源换了公开接口**：价格以前要登录卖家详情页才看得到，现在用
  `GET https://tokendance.space/portal/api/models/all`（匿名可取，带当前费率、牌价与峰谷两档），
  窗口、模态与协议取自 `GET https://tokendance.space/gateway/v1/models`。
- 文档：`packages/docs/content/models.zh.md` / `models.en.md` 的预置模型表、「DeepSeek 空闲时段」与
  「固定折扣」两节跟着改（固定折扣从九个减到七个，转售条目从八条增到十一条）。
- 测试：`core/test/model-catalog.test.ts` 里 TokenDance 那组的三处钉子（条目清单、打折清单、峰谷清单）
  跟到新事实，并新增一条「既无促销也无时段的条目，实收就是公布价」的断言。

## 兼容性

- 没有接口、磁盘格式或包名变化。已有 Project 自己的条目不被改写：价格与新增条目都要点一次**同步预置**
  才会进去，改过价格的条目（促销已被自己取消）保持用户自己的价。
