---
title: "web: 成本中心 —— 用量落库 + 价格表现算 + 三卡一折线（= 路线图 P4 的界面侧）"
labels: [欠账, scope:web, P2]
---

## 现象

Adelie 现在只有一个**每轮**的 token 数：`run_finished.usage` 里的输入/输出/总 token
（`TurnView.tsx` 底部那行），刷新之后只剩事件流里的原始数字。没有：
用完多少（会话级 / 项目级累计）、花了多少钱、哪家模型最贵、失败率。

penguin 的答案是三步（`docs/research/penguin-web-models-ops.md` §11.1）：**只落 token，
成本永远现算**（价格表是数据，改价只影响之后的查询，不改历史行）；页面是
三张汇总卡 + 2×2 图；错误单独一张表。

## 设计

1. **落库**：每轮结束追加一行
   `(ts, date, sessionId, projectId, agentId, provider, model, cacheRead, cacheWrite, output, total, status)`
   到 `usage` 表（或一份 JSONL）。Adelie 的 `run_finished.usage` 已经有一半字段，
   缺的是**归属**（哪个项目 / 哪个智能体）与 `status`。
2. **价格表**：模型表上加三个数字（USD/百万 token）。**只算三次乘法**：
   `cacheRead×p1 + cacheWrite×p2 + output×p3`。峰谷、促销、余额**先不做** —— 各是一层。
3. **查询**：`GET /api/usage?from&to&groupBy=`（`sessionId` / `projectId` / `agentId` / `model`）
   → `{ summary, series, byModel }`。服务端只聚合，**不重算历史成本**。
4. **界面**：**先只做三张汇总卡 + 一条成本折线**。2×2 图矩阵不做 —— 四张图里最难的不是画，
   是「空桶压缩 + 共享 x 轴」，那部分等有真实数据再补（penguin 自己也是这么建议的）。
   错误表可以独立先做且很便宜：一张 `error_records` + 一个统一写入函数，先只做「统计 + 最近 N 条」。
5. **顺带解决两处**：会话级 token 累计（给输入区的上下文环用，见 `web-composer-toolbar.md`）
   与「每轮统计行加成本」。这两条是同一份数据的两个视图，一起做才不用重算两遍。

## 期望

一期：落库 + 价格表 + `/api/usage` + 三卡一折线（验收：真跑几轮，页面上数字与事件流对得上）。
二期：错误表、按模型/按项目的分组、导出（penguin 自己也没有导出，可先不做）。
三期：2×2 图矩阵、峰谷价、余额。

## 复现

```bash
grep -rn "usage" packages/web/src/components/TurnView.tsx    # 只有每轮三个数字
grep -rn "api/usage" packages/server/src docs/api.md         # 都没有
```

## 影响

- 用户现在无法回答「这个月花了多少」—— 对一个会连续跑 agent 的产品，这是主功能而不是报表。
- 它同时是「上下文占用」与「思考等级」两件事的数据前提：上下文环要会话级累计 token，
  而思考等级的档位选择要靠成本差来说服人。

## 证据

- `docs/research/penguin-web-models-ops.md` §2（usage 面能力表）、§11.1（只落 token、成本现算）、
  §12 的 usage 最小可移植版本；
- `docs/redesign.md:130`（Adelie 自己的 P4 定义）、`docs/web-parity.md` §1 的 usage 行（判「待办 = P4」）；
- Adelie 现状：`packages/web/src/components/TurnView.tsx`、`packages/server/src/turn.ts` 的 `run_finished`。
