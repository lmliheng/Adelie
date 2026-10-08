# 请求成本在写入用量行时就定格

- **Date:** 2026-10-08
- **Type:** feature
- **Scope:** `server`
- **Breaking:** yes — 改价不再重算已记录的用量

[English](2026-10-08-usage-cost-at-record-time.md)

每条用量记录现在都带上它所代表那次请求的成本，在写入这一行的那一刻、按 Project 当时为这个
provider/model 组合存下的价格定格。改价、执行**同步预置**、促销开始或结束，都只影响之后的请求：
成本中心、对话页工具栏、`penguin cost` 与公司模式预算都改为加总存下的成本，查询时一律不再取价。

## 服务端

- `db/schema.ts` 与迁移 **14** `usage-record-cost` 给 `usage_records` 加上 `cost`（REAL，
  NULL = 该模型没有价格）与 `cost_settled`（INTEGER，默认 0），走 `ensureColumn` —— 声明式那条
  轨道已经加过这两列的库不受影响。迁移本身**有意不给已有行算成本**：算它要读每个 Project 的配置，
  SQLite 里没有。
- `db/repos/usage.ts`：`insert` 同时写入这两列；聚合改为对 `cost` 求和、统计 `uncosted`，不再返回
  原始 token 汇总 —— 于是每组的成本就是账单，`hasUncosted` 仍然说明它只是下限。
  `unsettledRefs` / `unsettledRows` / `settle` 支撑那一次性的兼容补算。
- `runtime/usage-recorder.ts` 按自己的时钟时刻调用 `ProjectConfigStore.getPricing(projectId,
  provider, modelId, at)` 给每一行定价，并把它当作账单。取价失败按「没有价格」处理：这一行照写，
  丢掉 token 比不记账更糟。
- `services/project-config-service.ts`：`getPricing` 现在多收一个时刻，返回那一刻实际生效的单一费率
  —— 存下的价格、扣掉该行的促销、再按那一刻落在的分时段档位折算（新增的 `scheduledRateAt`，与既有的
  `promotedRates` 并列）。手工改过的价格在两个档位都按原样计费：这里并不知道它是不是高峰价，
  减半等于凭空造出一个折扣。
- `services/usage-service.ts`：查询不再做任何定价，成本就是 recorder 定格的那个数。`lifetimeCost`
  （管理后台每账号的开销列）也是同一个「已记录成本」求和，一句不带筛选的分组扫描。
- `services/trace-service.ts`：Trace 页的性质不变 —— 仍按 Project 当前价格、以每个请求自己的
  时间戳定价（按小时与 provider/model 记忆化），所以改价之后它可以与成本中心不同，而账单以成本中心为准。

## 兼容性

升级前的用量记录没有成本。`Startup` 会在任何东西读取成本中心之前补算一次
（`UsageService.settleUnsettledCosts`，幂等，以 `cost_settled` 为准）：按每个 Project **现在**存的价格、
按每一行自己时间戳所在的档位。失败会被记进错误表（`usage_cost_settle_failed`）而不是抛出，
那些行在此后的一次启动前一直读作「未计价」。这个补算与 `cost_settled` 列在本版之后两个发布上移除。

## 有意未采用的上游部分

这条来自上游尚未合入的 `feat/usage-cost-at-record-time`，只取了服务端那一半 —— 在我们的树里，
逐行促销存在 `web.db` 的 `model_promotions` 表里，core 进程读不到，因此 core 无法把一次请求实际
计费的单价盖在它的 `token_usage` 事件上。未采用的部分与理由：

- core 的 `token_usage.pricing` 戳记，以及读它的 `resolveBilledPricing` / `billedRates`。促销在
  `web.db` 里，core 只看得到文件里的牌价，盖上的费率会把每一行促销模型都按原价计费。
- 目录的 `discountUntil` / `discountRateAt`。这里的促销是 `model_promotions` 里的一行、没有截止时刻，
  带时限的折扣暂时无处安放。

这个功能的完整形态是把促销搬进 Project 自己的配置、与牌价并排存放，再由 core 盖戳费率。
那是一个产品决定，不是一次机械移植。
