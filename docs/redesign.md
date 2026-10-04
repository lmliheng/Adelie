# Adelie 重构设计（v0.2）

> 2026-10-04 起。依据是两份只读研究：`docs/research/penguin-models-usage-trace.md`
> 与 `docs/research/penguin-users-secrets-permissions.md`（都对着 PenguinHarness
> 的真实源码写成，含路径与签名）。凡是「Penguin 怎么做」的句子，出处在那两份里；
> 凡是「Adelie 现状」的句子，出处在本仓源码。

## 0. 先说结论

Adelie 的**引擎**（ReAct 循环、事件溯源、fs-guard、审批）是能用的，问题几乎全在
**外壳与装配层**：没有用户、模型是裸字符串、用量只记 token 不折价、密钥 0644 明文、
Agent 不是一个有身份的实体。这些恰好是 PenguinHarness 已经解掉的那些题，所以这一版
不复用它的代码，复用它的**答案**。

四条原则，后面每一节都服从它们：

1. **引用而不是拼装。** 模型是 `{ provider, model }` 的引用，不是字符串拼接的产物；
   会话归属、密钥归属、用量归属都从这条引用出发。
2. **密钥是构造性质，不是过滤器。** 密钥只在「注入子进程」与「调用模型」两处出现，
   界面与日志永远拿不到值 —— 靠不让它流过去，而不是靠事后打码。
3. **权限是数据。** 谁能做什么写在一张表里（路由组声明 `auth` / `role`，命令策略写成
   规则表），不是散在各处的 `if`。
4. **能读数据根 = 管理员。** 桌面端不发明登录界面；第一次启动这个安装的人就是管理员，
   之后由他建普通用户。这条公理把「谁是管理员」从产品里消掉。

## 1. 目标形态

四端不变（CLI / Windows 桌面 / Web / PWA），变的是底下这四件事：

| 面 | 现在 | v0.2 |
| --- | --- | --- |
| 用户 | 无账号，回环请求无条件放行 | `~/.adelie/adelie.db` 的 `users` / `auth_sessions`；`is_admin` 两档；Cookie 会话 + Bearer 并存 |
| 模型 | `'deepseek' \| 'openai'` + 裸字符串模型名 | 模型目录（按组 id：deepseek / openai / kimi / qwen）+ `{ provider, model }` 引用贯穿 config→会话头→用量 |
| 用量 | 只累加 token | 落 `(provider, model, cacheRead, cacheWrite, output)`，成本按当次价格**现算** |
| 追踪 | 事件流 JSONL（一轮一事件） | 事件流之上加「一次对话的 trace 索引 + 分析 + 下载」 |
| 密钥 | `~/.adelie/.env`，默认 0644 | `~/.adelie/secrets/<userId>.env`，0600；每用户隔离；值不进上下文 |
| Agent | 就是「一次运行」 | 有身份的实体：状态目录 + 工具集 + 审批策略 + 默认模型引用；可自省、可自改 |

## 2. 用户与管理员（桌面端两档）

**Penguin 的做法**：SQLite `users(user_id, password_hash, is_admin, ...)` +
`auth_sessions(token_hash, user_id, expires_at)`；启动播种内置 `admin`，密码哈希后即
丢弃、靠一次性链接认领；`/api/*` 一律过门，与绑定地址无关；桌面壳用一次性 token 换
admin 会话，并把「用户管理」路由整片 403（`desktop_single_user`）。

**Adelie 现状**：`packages/server/src/auth.ts` 的 `isLoopbackRequest` 直接放行；
`ADELIE_TOKEN` 可选；没有用户表。

**目标设计**

- 数据根 `~/.adelie/`：
  - `adelie.db`：`users` / `auth_sessions`（SQLite，`node:sqlite` 就够，不加原生依赖）
  - `secrets/<userId>.env`（0600）
  - `sessions/users/<userId>/ws-<hash>/...`（会话按用户 → 工作区分区）
- 鉴权：`adelie_session` HttpOnly Cookie 优先，`Authorization: Bearer` 次之（CLI /
  桌面壳 / 自动化用）。回环**不再无条件放行** —— 桌面壳启动时拿一次性 token 换 Cookie，
  用户依然无感。
- 角色只有两档 `is_admin`，差异**只**落在这 6 个动作上（多一个都是过度设计）：

| 动作 | admin | user |
| --- | --- | --- |
| 写 provider 密钥 / 改 provider / baseUrl | ✅ | ❌ 403 `admin_required` |
| 建号 / 重置密码 / 删号 | ✅ | ❌ |
| 切换工作区根 | ✅ 任意目录 | ⚠️ 仅自己名下的分区 |
| 看「全部会话」 | ✅ | ⚠️ 仅自己的 |
| 删他人会话 / 导出 / 清空事件流 | ✅ | ❌（只能删自己的） |
| 审批策略、host/token、开机自启 | ✅ | ❌ |

聊天、工具审批、选模型这些**两档完全一致** —— 桌面端本来就是自己的机器，把聊天能力
也分级只会让人困惑。

- 路由分组写成数据：`{ prefix, auth: 'none' | 'user', role?: 'admin' }`，`role` 判定
  集中在一条中间件里。
- **会话归属必须从会话行读，不能信任当前请求**：否则用户 A 拿到 B 的 sessionId 就能读。

## 3. Agent 与模型分离

**Penguin 的做法**：模型不绑 Agent —— 创建 Session 时把 `(provider, model_id)` 配对写进
`session_meta`；Agent 的 `system_config.yaml` 里只有 `max_tokens` / `thinking_level` /
`timeoutMs`，没有 per-agent 默认模型；换模型要么先 summarize 再开新上下文（同会话），
要么另开会话并记 `[model_switch_from]`。

**为什么要分离**：Agent 是「怎么干活」（工具集、审批策略、状态、记忆），模型是「用什么
脑子干活」。绑死之后，换模型就等于换 Agent，用量与 trace 也没法按模型切开看。

**目标设计（Adelie）**

- `ModelRef = { provider, model }`（`adelie-core`）：
  - `AppSettings.model: string` → `model: ModelRef`
  - `AgentProviderConfig` 仍只收 `{ modelName, apiKey?, baseUrl? }` —— 它属于协议层，
    不该知道「目录」这回事
  - 会话头（`meta.json`）记录建会话时的 `ModelRef`；恢复时按头部解析
  - 用量记录、事件流里的 decision payload 都带 `provider` + `model`
- **模型目录**（本轮已落地）：`adelie-core/config/model-catalog.ts`，一组 = 一个厂商：
  `{ id, label, envKey, baseUrl, clientType, models[] }`。加一家厂商 = 加一组 + 在
  `ProviderName` 上加一个字面量（联合类型，写错编不过）。
- 换模型语义（本轮未做）：`/model` 在 CLI 与 Web 各分两条路 —— 同会话换（旧模型
  summarize 后开新上下文段）与另开会话（首条带 `[model_switch_from]`）。

## 4. 供应商适配：Kimi 与 Qwen

**Penguin 的做法**：协议适配交给 `@prismshadow/agenthub`，core 只做消息翻译；Kimi 走
独立 client，Qwen 走通用 `openai-chat`，靠模型目录的行级钉接。

**Adelie 的做法（本轮已落地）**：只有一套 `/chat/completions` 实现
（`deepseek.provider.ts`），每家一个十几行的子类换端点与厂商标：

- `kimi` → `https://api.moonshot.cn/v1/chat/completions`，密钥 `MOONSHOT_API_KEY`
- `qwen` → `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`，
  密钥 `DASHSCOPE_API_KEY`
- 端点、密钥变量、默认模型都从模型目录取 —— 不在 provider 类里再抄一份
- 顺带清掉了 `anthropic.provider.ts` / `gemini.provider.ts` 两个 0 字节文件（它们之前
  被 `index.ts` 的 `export *` 引着，看起来像「支持」，其实什么都没有）

**未验证**：kimi / qwen 两组的模型 id 取自两家公开文档，本机没有这两家的 key，
**没有发过真实请求**。id 认错了只会收到厂商的 404，改 `model-catalog.ts` 即可。

## 5. 用量与成本

**Penguin 的做法**：`usage_records` 表只落 token 四桶（cache_read / cache_write /
output / total）+ `(project, agent, session, provider, model_id, status)`；**不存成本**，
查询时按记录自身的时间戳套峰谷价现算：`cost = (cacheRead*r1 + cacheWrite*r2 +
output*r3) / 1e6`。好处是调价不用回填历史。

**Adelie 现状**：每轮 `DecisionPayload.usage` 有 token，Web 按轮显示；没有价格、没有
按模型/按会话的聚合。

**目标设计**

- `TokenUsageRecord` 增加 `provider` / `model` 归属字段（跟着 §3 的 ModelRef 走）
- 新增价格表（每 `(provider, model)` 一组 rates，支持峰谷两档），成本**现算**
- 服务端 `GET /api/usage`：summary(today/7d/total) + groupBy(model|agent|session|date)
  + series；CLI 加 `adelie cost`；Web 加用量页
- 先「读事件流现算」也能出一版（Adelie 已有全量事件读回），落库等量大再说

## 6. 一次对话的 trace

**Penguin 的做法**：append-only JSONL，**一个文件 = 一段完整模型上下文**（压缩或换模型
时 rotate 开新编号文件）；只写「可记录」消息（`partial_*` 不落盘）；读出口是
`resumeTrace` 与 HTTP `/traces`（含 `/analysis`、`/download`、`/import`）。

**Adelie 现状**：已经是事件溯源（`core/persistence/events.ts`，8 种
`SessionEventType`，append-only JSONL），`GET /api/sessions/:id` 能读回、能导出 markdown。
基础比 Penguin 还整齐 —— 缺的是「按上下文分段」与「分析视图」。

**目标设计**

- 事件流不动（它已经是事实源）；在它之上加 **trace 段**概念：把事件按「一段模型上下文」
  分片，分片边界 = 压缩 / 换模型 / 新建会话
- `GET /api/sessions/:id/trace`：分片索引 + 每片的事件计数、token 累计、耗时
- `GET /api/sessions/:id/trace/:index/analysis`：请求配对、工具耗时、压缩次数、token 趋势
- `GET /api/sessions/:id/trace/:index/download`：原始 JSONL 附件
- CLI：`adelie trace [会话ID]` 打印分片表；这一步同时是「Agent 自省」的数据来源（§8）

## 7. 私密数据

**Penguin 的做法**：三处存放（Agent 级 `.vault.toml` 0600、Project 级
`.project_config.toml` 0600、OAuth refresh 在 DB）；值只注入子进程环境，**Prompt 里只有
键名**；接口层一律遮罩。它的短板是**没有日志脱敏层** —— 防护全靠「值从不流经」这一构造
性质。

**Adelie 目标设计**

- 分级：**用户级** `~/.adelie/secrets/<userId>.env`（0600，provider key）；
  **Agent 级** `~/.adelie/agents/<agentId>/.vault.toml`（0600，工具要用的第三方凭证）
- 注入：只在「构造 provider」与「spawn 子进程」两处读值；vault 的内容进 Prompt 时只列
  **键名**
- 遮罩：任何响应体、任何日志都只出现 `hasApiKey` / `valueMasked`
- **补 Penguin 的短板**：加一层日志脱敏（写日志前把已知密钥值替换成 `***`），因为
  「不流经」这个性质一旦被将来的某次改动打破，没有第二道防线
- 本轮已先修最廉价的一处：写入 `~/.adelie/.env` 时 `mode: 0600` + 对已存在文件
  `chmod 0600`（旧版本升上来的文件是 0644）

## 8. Agent 自进化（更进一步）

这是「更进一步」的目标，不是这一版的范围，但设计上要留好口子：

- **自省的原料**：§6 的 trace（自己每一轮做了什么、花了多少、在哪卡住）
- **自省的动作**：Agent 能改自己的三样东西 —— 工作区指令（`ADELIE.md`）、
  技能包（`.adelie/skills/<name>/SKILL.md`）、工具审批策略的建议（只能提建议，
  拍板权在人）
- **边界**：Agent 能改的是**自己的状态**，不能改 Project 级安全配置（命令策略、
  fs-guard 边界、密钥）。照 Penguin 的做法：Project 策略压过 Agent 的 allow，deny 只能收窄
- **闭环**：`trace → 复盘 → 改自己的技能/指令 → 下一轮 trace 变好`，每一步都留事件，
  因此「它改了什么、为什么改」永远可回溯

## 9. 分期与验收

| 期 | 内容 | 验收（可运行的检查） | 状态 |
| --- | --- | --- | --- |
| **P1** | 模型目录 + Kimi/Qwen 适配 + 密钥 0600 + 空 provider 文件清理 | `pnpm typecheck` / `test` / `build` 全绿；`adelie --provider kimi` 报「缺少 MOONSHOT_API_KEY」而不是「不支持的提供方」；新建 `.env` 是 0600 | **已完成**（真机验过报错文案） |
| **P2** | `ModelRef` 贯穿 config→会话头→用量；`GET /api/models` 供 Web 渲染 | 换模型后 `GET /api/sessions/:id` 的会话头里能看到 provider+model；Web 设置弹窗不再硬编码清单 | **已完成**（见 §11） |
| **P3** | 用户表 + Cookie 会话 + 两档角色 + 每用户密钥与会话分区 | 非管理员 PATCH `/api/config` 的 apiKey 得 403；两个用户互看不见对方会话；桌面壳仍无感登录 | 未开始 |
| **P4** | 用量落库 + 成本现算 + `GET /api/usage` + `adelie cost` | 一次真实运行后 `adelie cost` 的 token 数与事件流对得上；改价表后历史成本跟着变 | 未开始 |
| **P5** | trace 分片索引 / 分析 / 下载 | 跑一次带压缩的会话，`adelie trace` 能列出 >1 个分片 | 未开始 |
| **P6** | 自省闭环（trace → 技能/指令改动，带审批） | 改动本身在事件流里可回溯，且 Project 策略仍然压得住它 | 未开始 |

## 10. P1 已完成与未完成

**已完成**（`adelie-core` 的模型目录、`adelie-providers` 的 kimi/qwen、
CLI/服务端的目录接入、密钥 0600，外加 26 个新测试）：

- `packages/core/src/config/model-catalog.ts`：四组，导出 `PROVIDER_NAMES` /
  `PROVIDER_ENV_KEYS` / `defaultModelForProvider` / `isProviderName` 等
- `packages/providers/src/{kimi,qwen}.provider.ts`；`Provider.ts` 的密钥表与工厂
  改为从目录派生
- `packages/cli`：`--provider` 的合法值来自目录，默认模型跟着提供方走
- `packages/server`：`defaultModelFor` / `isProviderName` 走目录；`writeApiKey` 0600
- `packages/web`：设置弹窗可选 kimi / qwen（**临时**，P2 改为从 `GET /api/models` 拉）
- 删掉两个 0 字节的 `anthropic.provider.ts` / `gemini.provider.ts`

**P1 的真机验收**（2026-10-04）：

```
$ HOME=/tmp/adelie-accept node packages/cli/dist/cli.js --provider kimi --model kimi-k2-0905-preview -p hi
缺少 MOONSHOT_API_KEY（--provider kimi 用的就是它）。请把它设为环境变量，或写入：
  /tmp/adelie-accept/.adelie/.env
```

## 11. P2 已完成与未完成

**已完成**：模型引用 `{ provider, model }` 从配置一路贯穿到会话头与事件头。

- `packages/core/src/types/ModelRef.ts`：`formatModelRef`（只用于显示）、
  `parseModelRef`（只切第一个斜杠）、`sameModelRef`、`isModelRef`
- `SessionMeta.model`（会话头）、`task_started.payload.model`（每一轮）、
  `SessionView.model` / `lastModel`
- 服务端 `GET /api/models`（下拉框的唯一出处）、`PATCH /api/config` 收 `model` 对象、
  会话视图带 `model` / `lastModel`
- CLI `/model 提供方/模型`、Web 设置弹窗从 `/api/models` 渲染

**P2 的真机验收**（2026-10-04，本地服务端 3021，空的临时 HOME）：

| 检查 | 结果 |
| --- | --- |
| `PATCH {"model":{"provider":"kimi"}}`（换家、不带 model） | 落到 `kimi/kimi-latest` |
| 同家再发 `provider`（model 省略） | 保持原型号不回落 |
| `PATCH {"model":"gpt-4o-mini"}`（裸字符串） | 只换型号，提供方不动 |
| `PATCH {"model":{"provider":"anthropic"}}` | `400 provider 只能是 deepseek / openai / kimi / qwen` |
| 旧客户的平铺 `{"provider":"qwen"}` | 按换家处理 → `qwen/qwen-plus` |
| 会话头里读到的东西 | `model: kimi/kimi-latest`（出生时）、`lastModel: openai/gpt-4o`（最近一轮实际用的） |
| 0.1 的老会话头（没有 `model` 字段） | 照常返回，只是没有 `model` / `lastModel`，不报错 |
| 会话头/事件头里的 `model` 形状不对 | 当作「没有这条信息」，200 返回，恢复不受影响 |
| 界面（420×760，Playwright） | 四家提供方都在下拉里；模型用 `datalist`，换到 kimi 自动填 `kimi-latest`；提示「密钥读 MOONSHOT_API_KEY（尚未配置）」；console 无错误 |

全仓 **684 通过 / 7 跳过**（core 82、providers 50、tools 190、runtime 151、server 37、
web 47、cli 121、desktop 6），`typecheck` 与 `build` 全绿。

**未完成**：

- 用量与成本（P4）还没落库 —— `ModelRef` 只是**有了归属的键**，还没有按它聚合的账本
- `packages/cli/src/vue-tui/composable/useAgent.ts` 仍硬编码 `DeepSeekProvider`
  （CLI 的实验 TUI 路径，未接入 CLI 主流程，P2 未动）
- `PATCH /api/config` 的平铺 `provider` 兼容分支是**临时**的，等确认线上没有 0.1 客户端后删
