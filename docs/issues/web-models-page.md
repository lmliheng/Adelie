---
title: "web: 模型页 —— 每项目一张模型表（配对键、整体替换、密钥授权、默认指针）"
labels: [欠账, scope:web, P2]
---

## 现象

Adelie 现在跟「模型」有关的界面只有两处：设置里的 `provider` 下拉 + `model` 输入框
（`SettingsDialog.tsx` 的「运行配置」一节），数据是 `GET /api/models` 的一份只读目录。

缺的是「**这一台能用哪些模型**」这件事本身：目录（catalog）是引擎认识哪几家，
而模型表是用户配了哪些、密钥在哪家有效、默认指哪一条。penguin 把这两件事分开：
`/models` 页面管表（配对键 + 整体替换 + 密钥授权 + 余额钉 + 测速），目录只是候选
（`docs/research/penguin-web-models-ops.md` §1）。

## 设计

- **表**：行 = `(provider, modelId)` 配对键（不是两个平铺字段 —— 这条 Adelie 已经在
  `model-catalog.ts` 与 `ServerSettings.model` 上定了，界面照它来）。每行带
  `label`（显示名）、三个价格数字（`cacheRead` / `cacheWrite` / `output`，USD/百万）、
  一个 `hasApiKey`（**只回布尔，密钥永不回传**）。
- **写**：`PUT /api/models` 整表替换（缺 `apiKey` 字段 = 保留原值，不是清空），admin-only。
  整体替换换来的是「不会出现半张表」这个性质 —— 逐条增删要自己定义冲突规则，不值得。
- **默认指针**：一条 `{provider, model}`，**与表分开存**（penguin 就是分开的），
  沿用现有 `PATCH /api/config` 的 `model` 字段，不新开路由。
- **存储**：先**配置文件**而不是 DB —— 每项目一份 `models.json`（或扩 model-catalog 的
  用户层）。表小、写得少、diff 肉眼可看，等它有几千行再谈迁移。
- **不做的**（penguin 有但 Adelie 现在抄了是负成本）：分组/折叠/拖拽/标记/搜索（条目少于一屏时
  全是负成本）、余额钉、协议探测、密钥授权流。测速留一个最小版：发一次 1 token 的请求，
  量首字时间与 tok/s，一个函数就够，但**排在表能读写之后**。

## 期望

一期：表能读能写（`GET` 遮罩 + `PUT` 整体替换 + 默认指针），界面是一张表 + 一行「默认」单选 +
一列密钥状态（有 / 无），加一个「测速」按钮。二期：价格字段接到成本中心（`web-usage-cost-center.md`）
与输入区的模型切换器（`web-composer-toolbar.md`）。三期才是 penguin 那套分组拖拽。

## 复现

```bash
grep -rn "listModels\|/api/models" packages/web/src        # 只有 client.ts + SettingsDialog 一处
grep -n "models" docs/api.md | head                        # 契约里只有 GET /api/models 一条
curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:4000/api/models | head -c 300
```

## 影响

- 没有这一页，「换模型」只能改一个字符串输入框，且**看不出哪家有密钥**（现在只有
  provider 下拉下面一行小字）。
- 价格不落表，成本中心（P4）就只能统计算不出钱。

## 证据

- `docs/research/penguin-web-models-ops.md` §1（models 面能力表）、§12 的 models 最小可移植版本；
- `packages/core/src/config/model-catalog.ts`（目录是候选、不是白名单这条语义的来源）；
- `packages/web/src/components/SettingsDialog.tsx`（现在唯一的模型界面）、`docs/api.md` §2；
- `docs/web-parity.md` §1 的 models 行（判「待办（批次 3，服务端要动）」）。
