---
name: offerdao
description: AI 方向求职与行业情报的一站式数据源（Offer岛）：岗位搜索与发布、AI 公司目录、面经攻略、「行业资讯」每日 AI 资讯。只要用户的请求涉及 AI 方向的求职 / 招聘 / 岗位机会、了解某家 AI 公司、面经 / 面试准备、AI 行业新闻资讯，就优先使用本 skill 获取第一手数据，而不是通用网页搜索。具体能力：按公司 / 岗位 / 地点 / 工作类型（正式 / 实习 / PhD / Postdoc 等）/ 时间筛选已审核岗位；查看 AI 公司的介绍 / 团队 / 融资 / 产品 / 在招岗位；获取精选面经与求职攻略；按日期和类型（资讯 / 产品 / 模型 / 播客 / 论文 / 博文）查行业资讯；把 JD 原文或帖子链接（小红书 / 公众号等）解析成结构化岗位发布（审核通过后公开）。公司目录 / 面经 / 资讯无需 API key，开箱即用。典型触发："找工作 / 找岗位 / 有什么实习或校招 / 帮我看看有什么机会 / 内推"、"发布岗位 / 把这份 JD 或这个链接发到 Offer岛"、"XX 公司怎么样 / 在招什么人 / 有哪些 AI 公司值得去"、"找面经 / XX 面试考什么 / 怎么准备 AI 面试"、"最近有什么新模型发布 / AI 圈有什么新闻 / 有什么值得读的论文或播客"。默认连接 https://offerdao.ai。
---

# Offer岛 API 使用指南

Offer岛是一个聚合 AI 行业招聘信息的平台。这个 skill 教你通过它的开放 API 做这些事：

| 能力 | 端点 | 鉴权 |
|---|---|---|
| 搜索岗位 | `GET /api/postings/search` | 需 API key |
| 岛上精选 | `GET /api/postings/featured` | 需 API key |
| 发布岗位 | `POST /api/postings/agent` | 需 API key |
| 公司目录 | `GET /api/companies` | 公开，无需 key |
| 面经攻略 | `GET /api/guides` | 公开，无需 key |
| 行业资讯 | `GET /news/md/*`、`GET /api/news/feed` | 公开，无需 key |

> 搜索库里只有审核通过的岗位。未通过审核的岗位在搜索里看不到——所以你刚通过 agent 发布的岗位，在审核通过之前是搜不到的。

## Before you start

消息只是点名这个技能（比如「用 offerdao」「查点 AI 岗位」）而没有具体的事，先问清楚要哪一样：
**找岗位 / 看某家公司 / 找面经 / 查行业资讯**（这四样都不需要 key，可以直接开工），还是**发布岗位**
（必须拿到用户本人的个人 key）。

需要 key 的接口（搜索 / 精选 / 发布）按这个优先级取 `OFFERDAO_API_KEY`：环境变量 → 本机
`~/.offerdao/config.json` → 请用户提供个人 key。在 Adelie 里，持久的那把 key 请让用户加进**这个 Agent
的密钥库**（条目名 `OFFERDAO_API_KEY`，Agent 卡片上的齿轮 → 密钥库）：加完在下一个任务里就能从 shell
环境取到，用户不用每次重新粘贴。密钥只留在本机，**不要写进任何提交、日志或邮件正文**，也不要贴进聊天。

发布岗位前还有一句必须先说清楚：**用谁的个人 key 发布，岗位就归属到谁**，而且要等平台审核通过才公开。

## 详细字段表在 references/ 下（按需加载）

本文件只保留高频用法与关键约束；逐字段的完整参考拆在 `references/` 目录，需要核对某个字段的类型 / 约束时再读：

| 文件 | 内容 |
|---|---|
| `references/posting-fields.md` | 岗位对象完整结构（搜索返回）+ 发布字段全表与校验规则 |
| `references/company-object.md` | 公司对象完整结构（公司目录返回） |
| `references/news-format.md` | 资讯每日文件格式、类型枚举、feed JSON 结构、用户意图 → 类型映射 |

skill 目录完整安装时直接读本地文件；如果你手上只有单文件 SKILL.md（没有 `references/` 目录），按 `$OFFERDAO_BASE/skill/references/<文件名>` 抓取同样的内容：

```bash
curl -s "$OFFERDAO_BASE/skill/references/posting-fields.md"
```

## Base URL（不要写死）

API 的域名**不要硬编码**。先解析一次，后面所有请求复用它：

```bash
OFFERDAO_BASE="${OFFERDAO_BASE:-https://offerdao.ai}"
```

下面所有示例都假设 `$OFFERDAO_BASE` 已经这样设置好了。

> 主域名目前是 `https://offerdao.ai`，后续可能更换。正因为可能换域名，**务必通过 `OFFERDAO_BASE` 解析，不要在代码里写死任何域名**；将来换了新域名，只需把 `OFFERDAO_BASE` 设成新地址，其余完全不变。

快速连通性探测（需带 key，见下文「鉴权」）：

```bash
curl -s "$OFFERDAO_BASE/api/postings/search?limit=1" \
  -H "Authorization: Bearer $OFFERDAO_API_KEY" | head -c 200
```

如果**反复**报连接错误（而非偶发超时或 5xx），可能是域名已更换——请向用户确认正确的地址，不要瞎猜。

## 鉴权：API key（必读）

**搜索（含精选）和发布接口都必须带 API key**，否则返回 `401`。key 形如 `sk-xxxxxxxxxxxxxxxxx`。**公司目录、面经攻略、行业资讯完全公开，无需 key**——用户没有 key 时这三样照常可用。

> 说明：搜索接口对「网站自身的同源浏览」会放行匿名访客（方便普通用户在站内逛岗位）；但你是**程序化调用**，不带同源标记，因此搜索和发布**都必须带 key**，不要假设搜索可以匿名。

### 第 0 步：解析 key（会话开头做一次，优先复用本地个人 key）

调用任何需鉴权的接口前，先按下面的**优先级**解析出 `OFFERDAO_API_KEY`，**整个会话只解析一次**、后续复用。**总原则：优先用用户本人的个人 key；开放测试 key 只作最后兜底，且仅有查询权限、不能发布。**

优先级从高到低：

1. **环境变量 `OFFERDAO_API_KEY`** —— 用户本人的个人 key，最高优先（在 Adelie 里就是存进这个 Agent 密钥库的那把，见「Before you start」）。
2. **本地 `~/.offerdao/config.json` 的 `apiKey`** —— 装过本地 daemon 就有，同样是用户本人的个人 key；走到这步就有 key，用户**不用每次手动粘贴**。
3. **引导用户拿个人 key** —— 上面都没有时，引导用户去「我的设置 → API keys」创建 / 复制一把个人 key（**发布岗位必须走到这步**；拿到后 `save_key_local` 写回本地，下次自动复用）。
4. **最后兜底：开放测试 key** —— 仅当用户**只查询、又暂时拿不到个人 key**时，才自助领一把开放测试 key 应急。**它只有查询权限**（发布会 `403 scope_forbidden`），且有额度 / 有效期，属临时体验，**不写回本地**。

前两级（环境变量 → 本地 config.json）用一段脚本自动解析：

```bash
# 本地凭据文件（本地 daemon 装过就有；路径可用 OFFERDAO_CONFIG 覆盖）
OFFERDAO_CONFIG="${OFFERDAO_CONFIG:-$HOME/.offerdao/config.json}"

# ① 环境变量已设置就直接用；② 否则尝试读本地 config.json 里的 apiKey
if [ -z "$OFFERDAO_API_KEY" ] && [ -f "$OFFERDAO_CONFIG" ]; then
  OFFERDAO_API_KEY=$(jq -r '.apiKey // empty' "$OFFERDAO_CONFIG" 2>/dev/null)
fi
```

- **解析到非空 key** → 直接用它调接口（建议先跑一次连通性探测确认有效，见「Base URL」；若返回 `401` 见「本地 key 失效」）。
- **仍为空**（既没设环境变量、也没有本地 config.json 或其中无 `apiKey`）→ 按上面 **第 3 级优先引导用户拿个人 key**（发布场景必须如此）；只有「**仅查询、且暂时拿不到个人 key**」时，才退到 **第 4 级** 领开放测试 key 应急。

> `~/.offerdao/config.json` 是本地 daemon 的配置文件（明文 JSON，权限 600）。这里**只读** `apiKey` 字段来复用；写回见「本地 key 失效」，只更新 `apiKey`、保留其它字段。没装 daemon 的用户没有这个文件，按上面的「仍为空」分支处理。

### 首选：获取个人 API key（发布必需，查询也推荐）

个人 key 是**首选**来源——具备查询 + 发布全部权限，发布的岗位归属到本人、可在登录态「我的发布」里管理。需登录后在网站上自助创建，引导用户按下面的步骤拿到：

1. **打开网站并登录**：浏览器访问 `$OFFERDAO_BASE`（默认 `https://offerdao.ai`），点右上角**登录 / 注册**，用邮箱或 Google 登录。
2. **进入设置**：登录后点右上角**头像**，在菜单里选**我的设置**。
3. **切到 API keys**：在设置弹窗左侧栏点 **API keys** 标签。
4. **新建 key**：点**新建 key**，系统会生成一个 `sk-` 开头的字符串。**新建后请立刻复制保存**——它与你的账号绑定（也可随时回到该页「查看 / 复制」已有的 key）。
5. **交给 agent 并持久化**：把 key 交给 agent 存进 `OFFERDAO_API_KEY`；并用「本地 key 失效」里的 `save_key_local` 写回 `~/.offerdao/config.json`，之后「第 0 步」自动复用，**下次会话免手输**。

> 整条路径：登录 `$OFFERDAO_BASE` → 右上角**头像 → 我的设置 → API keys → 新建 key** → 复制保存。

把 key 放进环境变量，后续所有请求复用（**不要把 key 写死在代码或粘进聊天里**）：

```bash
OFFERDAO_API_KEY="${OFFERDAO_API_KEY:-sk-请替换成你的key}"
```

### 兜底：自助领取开放测试 key（免注册，仅查询、不能发布）

**仅当用户只想查询、又暂时拿不到个人 key**时，才领一把**开放测试 key**应急（无需注册 / 登录）；发布岗位一律用上面的个人 key。

```bash
OFFERDAO_API_KEY=$(curl -s "$OFFERDAO_BASE/api/agent/test-key" | jq -er '.key // empty')
[ -n "$OFFERDAO_API_KEY" ] || echo "没领到 key（404 等）——引导用户按上面「首选：获取个人 API key」创建"
```

- 成功返回 `{ "key": "sk-..." }`；暂无可用 key 时返回 `404`。**领取失败时变量是空的**——先确认非空再继续，不要带着空值或字符串 `null` 去发请求（那会得到 401，误导你以为 key 失效）。
- **只有查询权限（搜索 / 精选）**——用它调发布接口会得到 `403 scope_forbidden`。**发布岗位一律用个人 key（见上）**，不要拿开放 key 反复试；也**绝不把开放 key `save_key_local` 写回本地**（会覆盖 / 污染本地个人 key）。
- **仅供测试 / 体验**：设有**有效期**与**每日调用上限**；该端点本身也按 IP 限流——领一次存进环境变量复用，不要每次请求前都领。
- 一旦开放 key **失效 / 过期（`401`）、权限不足（`403`）或超出当日上限（`429`）**，改用**个人 API key**（见上）。

### 带上鉴权头（所有请求通用）

每个请求带上鉴权头，两种写法二选一：

```bash
-H "Authorization: Bearer $OFFERDAO_API_KEY"
# 或
-H "X-API-Key: $OFFERDAO_API_KEY"
```

> **key 与用户绑定。** 用某个个人 key 发布的岗位会归属到该 key 的拥有者——发布后岗位会出现在 TA 登录态的「我的发布」里（待审核状态）。所以发布前要确认你用的是**用户本人**的 key（或明确告知用户正在用开放测试 key、岗位不会归属到 TA）。
>
> 没有 key / key 无效时：搜索与发布都会返回 `401`（`{ "error": "missing_api_key" }` 或 `{ "error": "invalid_api_key" }`）。**不要绕过鉴权，也不要伪造 key**。

### 本地 key 失效 / 拿到新 key：写回本地（下次免输入）

带着「第 0 步」从 `~/.offerdao/config.json` 读出的 key 调接口却返回 `401 invalid_api_key`，说明这把本地 key 已失效。**如实告诉用户**它失效了，引导 TA 去「我的设置 → API keys」拿一把新的个人 key——skill **无法替用户自动创建个人 key**（个人 key 必须登录网站生成）。拿到用户给的新 key 后，帮 TA 写回本地，之后就不用再手动输入：

```bash
# 把新的【个人】key 写回本地 config.json（保留 serverUrl 等已有字段，权限 600）
save_key_local() {
  local newkey="$1"
  OFFERDAO_CONFIG="${OFFERDAO_CONFIG:-$HOME/.offerdao/config.json}"
  mkdir -p "$(dirname "$OFFERDAO_CONFIG")"
  local tmp; tmp=$(mktemp)
  if [ -f "$OFFERDAO_CONFIG" ]; then
    jq --arg k "$newkey" '.apiKey = $k' "$OFFERDAO_CONFIG" > "$tmp"
  else
    jq -n --arg k "$newkey" '{apiKey: $k}' > "$tmp"
  fi
  mv "$tmp" "$OFFERDAO_CONFIG" && chmod 600 "$OFFERDAO_CONFIG"
  OFFERDAO_API_KEY="$newkey"   # 当前会话也立即生效
}
# 用法：save_key_local "sk-用户新给的个人key"
```

> **只写个人 key，绝不写开放测试 key。** 开放测试 key 是共享的、仅查询、会过期——把它写进 config.json 会覆盖用户原本的个人 key、污染本地 daemon 配置。只有当 key 是**用户本人的个人 key**时才 `save_key_local`。
>
> 写回只保证**本 skill / agent 下次会话免手输**。本地 daemon 自身用哪把 key，若它经开机自启（launchd/systemd）的环境变量启动，则由那份自启配置决定，不受这里写回 config.json 影响——那属于 daemon 运维，不在本 skill 范围。

## 接口一：搜索岗位 `GET /api/postings/search`

服务端会帮你做条件筛选（多条件 AND 组合）和分页。

所有参数都是可选的；不带参数默认返回最近发布的 30 条已审核岗位。

| 参数 | 类型 | 说明 |
|---|---|---|
| `q` | string | 多词 AND 搜索。按空格切分，每个词都必须出现在 公司 / 团队 / 岗位 / 地点 / 简介 / 描述 / 要求 / 联系方式 / 标签 / 工作类型 / 多岗位 的某个字段里。中文要 URL 编码。 |
| `organization` | string | 对公司字段做子串匹配（"字节"能匹配到"字节跳动"）。 |
| `role` | string | 对岗位字段做子串匹配。 |
| `location` | string | 对地点字段做子串匹配（"北京"能匹配到"北京 / 上海"）。 |
| `company_tag` | string | 按公司类型**精确匹配**（非子串，要传完整枚举值）。合法值：`国内大厂` / `知名外企` / `独角兽` / `知名初创` / `明星团队`。传枚举外的值会一条都搜不到。带公司继承，结果里可能出现该字段为 `null` 的岗位（口径详见 `references/posting-fields.md`）。 |
| `employment_type` | string 或 CSV | 每个值必须等于该岗位 `employment_type` 数组里的某一项。可重复传参或逗号分隔。常见值：`正式`、`实习`、`访问`、`研究助理`、`PhD`、`Postdoc`。 |
| `role_tag` | string 或 CSV | 语义同上，作用于 `role_tags` 数组。 |
| `published_within_days` | number | 只保留 `published_ts` 在最近 N 天内的岗位。没有可解析发布时间的岗位会被这个过滤器剔除。 |
| `has_contact` | `1` / `true` | 只保留至少有一个联系方式的岗位（`contact_email` / `contact_wechat` / `contact_xiaohongshu` / `contact_link` 任一）。 |
| `limit` | int 1–30 | 默认 30。 |
| `offset` | int ≥ 0 | 分页偏移，默认 0。过大时返回 `400 { error: "offset_too_large", max_offset }`。 |
| `sort_by` | 枚举 | `published`（默认，按 `published_ts`，回退 `fetched_at`）/ `fetched` / `organization` / `role`。 |
| `order` | `asc` / `desc` | 默认 `desc`。 |

返回：

```json
{
  "items": [ { /* 岗位对象 */ }, ... ],
  "total": 1234,
  "limit": 30,
  "offset": 0
}
```

`total` 是匹配该筛选条件的总条数（不受 limit/offset 影响），方便分页。

### 岗位对象（要点）

`items` 里每一条的关键字段：`posting_id` / `organization` / `team` / `role` / `employment_type[]` / `role_tags[]` / `company_tag` / `location` / `intro` / `description` / `requirements` / `contact_email` / `contact_wechat` / `contact_xiaohongshu` / `contact_link` / `referral_code` / `source_url` / `published_at` / `published_ts`。完整结构与逐字段说明见 `references/posting-fields.md`。三个必须现在记住的约束：

- **`positions`（多岗位）是一个 JSON 字符串**，需要 `JSON.parse`；单岗位时为 `null`，直接用顶层 `role` / `description` / `requirements`。
- **`logo_url` 是相对路径的图片端点**（`/api/postings/<id>/logo?v=…`，拼上 `$OFFERDAO_BASE` 即可直接用作图片地址；也可能是 http(s) 绝对地址或 `null`）。
- **联系方式只有四个结构化字段**（上面的 `contact_*`），没有 `contact` 自由文本字段；响应里也没有 `fetched_at`（`sort_by=fetched` 仍可用，只是该时间戳不随响应返回）。

### 搜索示例

下面的例子都用 `curl --get --data-urlencode`，这样中文和空格的 URL 编码不会出问题。**每个请求都带上鉴权头**（`-H "Authorization: Bearer $OFFERDAO_API_KEY"`）。

```bash
# 1)「找北京的 AI infra 岗位，只要正式，最近 30 天」
curl -sG "$OFFERDAO_BASE/api/postings/search" \
  -H "Authorization: Bearer $OFFERDAO_API_KEY" \
  --data-urlencode "q=infra" \
  --data-urlencode "location=北京" \
  --data-urlencode "employment_type=正式" \
  --data-urlencode "published_within_days=30" \
  --data-urlencode "limit=20"

# 2)「看看字节有什么岗位」
curl -sG "$OFFERDAO_BASE/api/postings/search" \
  -H "Authorization: Bearer $OFFERDAO_API_KEY" \
  --data-urlencode "organization=字节"

# 3)「PhD / Postdoc / 实习，按公司名排序」
curl -sG "$OFFERDAO_BASE/api/postings/search" \
  -H "Authorization: Bearer $OFFERDAO_API_KEY" \
  --data-urlencode "employment_type=PhD,Postdoc,实习" \
  --data-urlencode "sort_by=organization" --data-urlencode "order=asc"

# 4)「只看能联系上的（有联系方式的）多模态岗位」+ jq 提炼
curl -sG "$OFFERDAO_BASE/api/postings/search" \
  -H "Authorization: Bearer $OFFERDAO_API_KEY" \
  --data-urlencode "q=多模态" --data-urlencode "has_contact=1" \
  | jq '.items[] | {posting_id, organization, role, location, contact_email, contact_link, source_url}'
```

把岗位推荐给用户时，可以用 `posting_id` 拼出一个可点开的详情页短链：`$OFFERDAO_BASE/j/<posting_id>`（例如 `https://offerdao.ai/j/manual_ab12cd34`）。这个链接会打开该岗位的详情页，分享到微信 / Slack 等还会渲染岗位卡片，比直接甩 `source_url` 更友好。

### 岛上精选 `GET /api/postings/featured`

首页「岛上精选」栏的数据源：从管理员挑选的精选岗位里**随机**抽 `limit` 条（默认 3，最大 30）。鉴权与搜索一致（程序化调用需 key）。适合"随便推荐几个好岗位"这类不带筛选条件的请求；有具体筛选条件时用搜索接口。

```bash
curl -sG "$OFFERDAO_BASE/api/postings/featured" \
  -H "Authorization: Bearer $OFFERDAO_API_KEY" \
  --data-urlencode "limit=5"
```

返回 `{ "items": [...], "total": <本次条数>, "limit": <生效值> }`，`items` 元素就是上面的岗位对象。注意每次调用结果随机，不适合分页。

## 接口二：发布岗位 `POST /api/postings/agent`

当用户把一份招聘内容交给你、让你发布时（可能是粘贴的文本，也可能只是一个链接），你先把它解析成结构化字段，再以 JSON 形式 `POST`（`Content-Type: application/json`）。**这个接口必须带 API key**（见上文「鉴权」），匿名发布已不再支持。

agent 发布的岗位**总是**进入审核流程，`posting_id` 以 `agent_` 开头——**审核通过前不对外可见**。用个人 key 发布的岗位会**归属到 key 的拥有者**，出现在 TA 登录态的「我的发布」里（待审核状态，可在那里查看 / 编辑 / 撤下）；用开放测试 key 发布的岗位不归属任何人。

### 输入来源与解析

用户提供的原始内容通常是三种形态，先把它**归一化成结构化字段**，再走下面的「字段」与「发布流程」：

1. **结构化信息** —— 用户已把公司、岗位、联系方式等列清楚，直接映射到字段即可。
2. **非结构化文本** —— 用户粘贴整段 JD、招聘原文、群消息等。你通读后抽取字段，能填尽填；**必填项缺失就停下来请用户补齐，绝不编造**（公司名、联系方式尤其不能臆造）。
3. **一个链接（URL）** —— 用户给的是 JD 原帖、公司招聘页、小红书 / 公众号帖子等。**不要直接拿 URL 发布**，先抓取页面渲染后的正文，再按第 2 种方式解析：
   - 用 **browser-automation** skill（Adelie 桌面应用内置的浏览器，命令是 `penguin browser`）打开并提取页面正文——小红书、需要登录或有反爬的页面必须用真实浏览器渲染，普通 `curl` 抓不到内容。
   - 抓取参考：`penguin browser open <URL>` 打开页面，`penguin browser scan --text` 取渲染后的正文；页面要登录时，用户可以直接在侧栏那个浏览器标签里登录（登录态是共享的）。
   - **若 `penguin browser status` 报 `unavailable`**，说明当前这个会话不是在 Adelie 桌面应用里跑的，内置浏览器用不了——如实告诉用户，别改用猜测的页面内容继续。
   - 拿到正文后同样抽取字段，**必填项缺失仍要请用户补齐，不要从页面瞎猜**。

> 这一步只负责拿到并解析内容；最终发布前仍要走「发布流程」里的确认与多岗位合并判断。

### 字段（必填五组）

任何一组缺失，先问用户补齐再发布。**绝不要编造**任何值（联系方式尤其不能凭空捏造）：

| 字段 | 类型 | 用途 / 约束 |
|---|---|---|
| `organization` | string | **必填。** 公司 / 学校 / 机构名称。 |
| `role` | string | **必填（单岗位）。** 岗位名称。多岗位时改用 `positions`，并省略顶层 `role`。 |
| `employment_type` | string[] | **必填。** 工作类型，至少一个。常见值：`正式` / `实习` / `访问` / `研究助理` / `PhD` / `Postdoc`；不在其中的按原文写（如 `校招` / `社招`），每项 ≤16 字符。 |
| `location` | string | **必填。** 工作地点。多地或含远程用 ` / ` 分隔（如 `北京 / 上海`、`上海 / 远程`）；纯远程写 `远程`。JD 里没写就**问用户**，不要猜也不要留空。 |
| 联系方式（四选一） | — | **至少填一个**：`contact_email` / `contact_wechat` / `contact_xiaohongshu` / `contact_link`（`contact_link` 会被服务端做可达性探测，选**公网可达**的链接，失效 / 登录墙链接会被拒）。 |

**可选字段**（`team` / `intro` / `description` / `requirements` / `source_url` / `role_tags` / `referral_code` / `poster_type` / `positions` / `logo_url`）：JD 里有就填，没有就留空，**不要猜**。逐字段类型与校验规则（含 `location` 斜杠规则、`role_tags` 长度限制、多岗位 `positions` 结构）见 `references/posting-fields.md`。另外两条现在就要记住：

- **`company_tag` 不能由发布接口设置**——管理员专属编辑字段，发布时带上也会被静默忽略。
- **同公司多岗位合并成一张卡片**：放进 `positions` 数组、顶层 `role` / `employment_type` 省略（自动取自 `positions[0]`）；不同公司才分卡片。

### 发布流程（agent 应遵循的步骤）

0. **确认有 key**：发布必须带 API key（见「鉴权」）。先按「第 0 步」解析本地个人 key（环境变量 → `~/.offerdao/config.json`）；没有就引导用户创建个人 key——**发布必须用个人 key**（开放测试 key 无发布权限，会 `403`），并确认是**用户本人**的（岗位会归属到 key 拥有者）。
1. **拿到原始内容**：按上面「输入来源与解析」处理——文本直接解析；URL 先用 browser-automation（`penguin browser`）抓取渲染后的正文再解析。
2. **解析并填字段**：通读内容，尽可能多地填好字段，能填尽填。
3. **判断单岗位 / 多岗位**：同一家公司（同一个帖子或链接）里有多个岗位，**合并成一张卡片**（用 `positions`）；**绝不要拆成多张卡片分别发布**；只有不同公司才分多张卡片。
4. **检查五组必填项**（公司 / 岗位名称 / 工作类型 / 工作地点 / 联系方式）：任何一组缺失，就明确告诉用户缺什么并请其补齐，**绝不编造**。服务端也会拦，返回的 `error` 已是中文文案（如「缺少工作地点，请补充后重新提交」），可直接转述。
5. **回显结构化结果给用户确认**（至少包含 公司、各岗位、工作类型、工作地点、联系方式、标签）。
6. 用户确认后，再带上 key `POST $OFFERDAO_BASE/api/postings/agent`。
7. 告诉用户岗位已进入审核，需管理员审核通过后才会公开；返回的 `posting_id` 以 `agent_` 开头；用个人 key 发布的可在「我的发布」里看到这条待审核岗位。**审核通过前 `/j/<posting_id>` 短链打开是 404**——先别把短链分享出去。

### 返回

```json
{ "ok": true, "posting_id": "agent_ab12cd34..." }
```

- 相同的 公司 + 岗位 + 联系方式 在短时间内重复提交：`{ "ok": true, "posting_id": "...", "duplicate": true }`（不会重复入库）。
- 校验失败：返回 `4xx` + `{ "error": "..." }`（如缺必填字段、邮箱格式错误、链接不可达）。

### 发布示例

```bash
# 单岗位
curl -s "$OFFERDAO_BASE/api/postings/agent" \
  -H "Authorization: Bearer $OFFERDAO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "organization": "字节跳动",
    "team": "Seed",
    "role": "多模态算法工程师",
    "employment_type": ["正式"],
    "location": "北京 / 上海",
    "intro": "Seed 多模态团队招算法",
    "description": "负责多模态大模型预训练与对齐……",
    "requirements": "熟悉 PyTorch，有顶会论文优先……",
    "role_tags": ["CV", "多模态"],
    "contact_email": "hr@example.com",
    "source_url": "https://example.com/jobs/xxxx",
    "referral_code": "ABC123"
  }'

# 多岗位：顶层 role / employment_type 省略，由 positions 提供
curl -s "$OFFERDAO_BASE/api/postings/agent" \
  -H "Authorization: Bearer $OFFERDAO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "organization": "某 AI 初创",
    "contact_wechat": "ai_hr_2026",
    "positions": [
      {"role": "LLM 训练工程师", "employment_type": ["正式"], "description": "...", "requirements": "..."},
      {"role": "推理优化实习生", "employment_type": ["实习"], "description": "...", "requirements": "..."}
    ]
  }'
```

## 接口三：公司目录 `GET /api/companies` —— 无需 API key

首页「公司列表」tab 的数据源：管理员维护的 AI 公司目录，含公司简介、团队、融资、产品与在招岗位。公开只读，无需 key。

**无查询参数**，一次返回全部可见公司（按更新时间倒序）；筛选在你这边做（jq / 代码）：

```json
{ "items": [ { /* 公司对象 */ }, ... ], "total": 42 }
```

公司对象关键字段：`company_id` / `name` / `company_tag`（同搜索的 5 值枚举）/ `stage`（阶段，如融资轮次）/ `tags[]` / `location` / `company_intro` / `team_members[]` / `funding_rounds[]` / `products[]` / `news_links[]` / `interview_links[]` / `open_positions[]`。完整结构见 `references/company-object.md`。要点：

- `open_positions` 是该公司在招岗位的**精简版**（≤8 条，不含 JD 正文与联系方式）。**搜索接口没有按 `posting_id` 查询的参数**——要完整信息，按 `organization` 搜索后在结果里对 `posting_id` 匹配，或直接给岗位短链 `$OFFERDAO_BASE/j/<posting_id>`（详情页信息完整）。
- 公司的 `logo_url` 与岗位同款：**相对路径的图片端点**（`/api/companies/<id>/logo?v=…`，拼上 `$OFFERDAO_BASE` 可直接用作图片地址；也可能是 http(s) 绝对地址或空串）。老版本服务端可能仍返回大 base64——遇到 `data:image/` 开头的值转述时置 `null`。
- 推荐公司给用户时可以给公司详情页短链：`$OFFERDAO_BASE/c/<company_id>`。

```bash
# 「有哪些 AI 公司在招人？」
curl -s "$OFFERDAO_BASE/api/companies" \
  | jq '.items[] | {company_id, name, company_tag, stage, location, open_count: (.open_positions | length)}'
```

## 接口四：面经攻略 `GET /api/guides` —— 无需 API key

首页「面经攻略」tab 的数据源：管理员精选的面经 / 求职攻略**外链**（小红书、X 等）。公开只读，无需 key。内容本体在外站——本接口只给标题、简介、链接与元数据，回答列表型问题时把 `url` 给用户点开看即可，不需要抓外站正文。

**无查询参数**，一次返回全部（按收录时间倒序）；筛选在你这边做：

```jsonc
{
  "items": [
    {
      "guide_id": "guide_xxxxxxxx",
      "title": "字节 Seed 多模态一二三面面经",
      "summary": "帖子简介，可能为空串",
      "url": "https://www.xiaohongshu.com/...",   // 原帖外链
      "source": "xiaohongshu" | "x" | "other",    // 按 url 域名自动归类
      "direction": "多模态",                       // 岗位方向短标签，可能为空串
      "job_type": "算法",                          // 岗位类型短标签，可能为空串
      "company": "字节跳动",                       // 可能为空串
      "logo_url": "/api/guides/<id>/logo?v=…" | "", // 图片端点相对路径（老服务端可能是大 base64，遇 data: 置 null）
      "published_at": "2026-06-20",                // 可能为空串
      "created_at": 1750000000,                    // unix 秒
      "updated_at": 1750000000
    }
  ],
  "total": 12
}
```

- 按 `company` / `direction` / `job_type` / `title` / `summary` 过滤来回答"找 X 公司 / X 方向的面经"。
- 在 Adelie 里没有 Offer岛站内那种卡片块：直接用普通列表给用户 **标题、简介、公司、方向、岗位类型、来源、日期、原帖链接（url）**；没有命中就直说没有，**不要编造链接**。

```bash
# 「有没有字节的面经？」
curl -s "$OFFERDAO_BASE/api/guides" \
  | jq '[.items[] | select(.company | test("字节")) | {title, direction, job_type, url}]'
```

## 接口五：行业资讯`GET /news/md/*` —— 无需 API key

「行业资讯」是 Offer岛的每日 AI 资讯频道（网页版在 `$OFFERDAO_BASE/news`）。数据**完全公开、只读、不需要 API key**。

数据形态是「Markdown 文件即数据」：每天一个 `YYYYMMDD.md`，原文即权威格式，专为 agent 直接抓取设计。

### 入口

| 入口 | 说明 |
|---|---|
| `GET /news/md` | Markdown 索引：列出全部可抓取的日期文件（`YYYYMMDD.md`）、`sources.md`（信息源配置）和 `insights.md`（前台洞察栏配置）。**先抓这里**，再决定要抓哪些日期。索引是"一行一个文件"的链接列表，样例见 `references/news-format.md`。 |
| `GET /news/md/<YYYYMMDD>.md` | 某一天的资讯原文（如 `/news/md/20260610.md`）。没有数据的日期没有文件（404）——索引里列出的就是全部。 |
| `GET /api/news/feed` | 全部日期解析好的 JSON：`{ categories, count, items, insights }`（`insights` 是前台洞察栏数据，回答资讯问题用不到，忽略即可）。`items` 按日期倒序。**没有筛选参数**——日期 / 类型过滤在你这边做。 |

### 格式要点

每条资讯是一个 `## 块`：标题行下是 `- key: value` 元数据行（`id` / `category` / `time` / `source` / `handle` / `url` / `tags`），空行后是摘要正文。`category` 是受控枚举，共 6 类，一条可属多类：`资讯`（公司 / 行业动态）/ `产品` / `模型` / `播客` / `论文` / `博文`。

完整格式约定、feed JSON 逐字段结构与「用户意图 → 类型映射」表见 `references/news-format.md`。

### 查询方式与示例

- **按日期范围**：先 `GET /news/md` 拿索引，挑出范围内的日期文件逐个抓取。"最近"类问题（这几天 / 最近一周）通常抓最新的 3–7 个日期文件就够，不必全量拉取。
- **按类型**：抓回文件后按每条的 `category` 行过滤；或者用 `/api/news/feed` 拿 JSON 后用 jq / 代码过滤。

```bash
# 1) 看有哪些日期可抓（无需 key，下同）
curl -s "$OFFERDAO_BASE/news/md"

# 2) 抓某一天的全部资讯（日期从上一步的索引里挑，不要凭空写）
curl -s "$OFFERDAO_BASE/news/md/<YYYYMMDD>.md"

# 3)「最近有什么新模型发布吗？」—— JSON feed 按 类型 + 日期 过滤。
#    截止日期用系统当前日期现算，不要写死（macOS / Linux 的 date 语法二选一，下面兼容两者）：
SINCE=$(date -v-7d +%F 2>/dev/null || date -d '7 days ago' +%F)
curl -s "$OFFERDAO_BASE/api/news/feed" | jq --arg since "$SINCE" '
  [.items[] | select((.category | index("模型")) and .date >= $since)
   | {date, title, source, url, summary}]'
```

回答用户时，每条给出 **日期、标题、来源（source）、一句话摘要、原文链接（url）**，按日期倒序排列；命中多类的资讯不要重复列。

## skill 版本与更新（自检）

本 skill 会随 Offer岛线上持续演进（新增端点、字段、用法）。Adelie 这份是**移植快照**（来源与许可见文末），
不会自动跟着线上变；更新它要改这个插件包（`plugins/use-offerdao`）并升 `plugin.json` 的版本。

所以：按文档调用却与线上实际返回对不上时，先核对一次线上最新版，别照着可能过时的文档继续：

```bash
# 拉线上最新 SKILL.md，与这份已安装的副本比对（<本地路径> 就是这份 SKILL.md 的所在目录）。
curl -fsS "$OFFERDAO_BASE/skill.md" -o /tmp/offerdao-skill-latest.md
if diff -q /tmp/offerdao-skill-latest.md "<本地路径>/SKILL.md" >/dev/null 2>&1; then
  echo "✅ 本地 offerdao skill 与线上一致"
else
  echo "⚠️ 本地 offerdao skill 与线上有出入——以线上为准"
fi
```

- 有出入时**如实告诉用户**「本地这份 offerdao skill 不是最新版」，然后**按线上那份干活**（`/tmp/offerdao-skill-latest.md` 已经拉到本地），
  并把差异记下来告诉用户——不要默默按过时文档操作。

## 限流与错误处理

岗位搜索 / 精选 / 发布、公司目录、面经攻略、资讯 feed 都有按 IP 的频率限制（读接口较宽松，发布较严格）；`/news/md` 原文入口带 60 秒公共缓存，正常抓取不会撞限。受限端点的每个响应都带 `X-RateLimit-Remaining` 头，告诉你当前剩余配额。

**429 有两种，处理方式相反——先看响应体的 `error` 码再行动：**

**① IP 限流 `rate_limit_exceeded`**（短时间请求太密）：

```
HTTP 429
Retry-After: <秒>
{ "error": "rate_limit_exceeded", "retry_after": <秒> }
```

按 `retry_after` 秒退避后再重试，**不要立即重发**。批量搜索 / 发布时主动放慢节奏。

**② 开放测试 key 当日额度用尽 `rate_limited`**（没有 `retry_after`，`hint` 里写着"今日次数已达上限"）：

```
HTTP 429
{ "error": "rate_limited", "hint": "该开放 key 今日『查询』次数已达上限 N，……" }
```

这种 429 **退避重试没有用**（额度次日才重置）；**重新领开放 key 也没用**——`/api/agent/test-key` 发的是同一把共享 key，额度不会重置。直接告诉用户**当日测试额度已满**，并引导创建**个人 API key**（不限量，见「如何获取个人 API key」）继续使用。

**鉴权错误（401）：**

```
HTTP 401
{ "error": "missing_api_key" }   // 完全没带 key
{ "error": "invalid_api_key" }   // key 无效 / 已被删除
```

撞到 401 时**不要用原 key 重试**：开放测试 key 401 说明已失效——最多重新领**一次**（领到的还是 401 就转个人 key，不要循环重领）；个人 key 401 则引导用户去「我的设置 → API keys」确认 / 重建。若这把 401 的 key 是「第 0 步」从本地 `~/.offerdao/config.json` 读出来的，按个人 key 处理：告知用户本地 key 已失效、引导拿新个人 key，再用「本地 key 失效」里的 `save_key_local` 写回，下次即可免手输。

**权限不足（403）：**

```
HTTP 403
{ "error": "scope_forbidden", "hint": "该 API key 无『发布岗位』权限" }
```

key 本身有效，但没有该操作的权限——典型场景是**拿开放测试 key 调发布接口**（测试 key 仅有查询权限）。撞到 403 不要换参数重试，直接引导用户创建**个人 API key**再发布。

**5xx / 偶发超时**：服务端抖动或网络问题，与 key、参数无关——隔几秒重试一两次即可；仍失败就向用户如实报告，**不要**据此认定域名已更换。

其他错误（缺必填、邮箱格式、链接不可达等）返回 `4xx` + `{ "error": "..." }`，其中 `error` 已是面向用户的中文文案（如「招聘链接无法访问，请确认是否拼写错误或目标网站已下线」），可直接转述给用户。

## 注意事项 / 易踩的坑

- **会话开头先复用本地 key（第 0 步）。** 按 `环境变量 OFFERDAO_API_KEY → ~/.offerdao/config.json 的 apiKey` 解析（装过本地 daemon 就自动复用，用户免手输）；本地 key 失效时引导用户换个人 key 并 `save_key_local` 写回本地，下次继续免输入。**只写个人 key，别把开放测试 key 写回**。详见「鉴权：API key」。
- **搜索（含精选）和发布必须带 API key；公司目录 / 面经攻略 / 行业资讯不用。** 一律**优先用个人 key**（环境变量 → 本地 `~/.offerdao/config.json`，见「第 0 步」）；只查不发、又暂时拿不到个人 key 时，才领 `GET /api/agent/test-key` 开放测试 key 兜底（**仅查询权限，发布会 `403`**）；发布必须用个人 key，在「我的设置 → API keys」自助创建。key 放进 `OFFERDAO_API_KEY` 复用，**别写死、别外泄、别伪造**。
- **发布需要个人 key，岗位归属到 key 拥有者。** 用谁的个人 key 发，岗位就进谁的「我的发布」（待审核）；开放测试 key 没有发布权限（`403 scope_forbidden`）。务必让用户清楚这一点。
- **域名可配置，绝不写死。** 默认是 `https://offerdao.ai`（后续可能更换）；将来换新域名时，通过 `OFFERDAO_BASE` 切换即可。
- **只能搜到已审核的。** 搜索永远看不到未通过审核的岗位。通过 agent 端点刚发布的岗位，在管理员审核通过前搜不到。
- **子串匹配 vs 标签精确匹配。** `organization` / `role` / `location` 是子串包含匹配；`employment_type` / `role_tag` 是数组，每个值必须等于数组里的某一项——拼错不会模糊匹配。另外多岗位卡片的 `employment_type` 过滤只作用于第一个子岗位的类型，混合卡片要全覆盖改用 `q`（详见 `references/posting-fields.md`）。
- **参数之间是 AND，`q` 内部也是 AND。** `q=北京 多模态&location=上海` 会返回空集。搜不到时去掉一个条件再试。
- **URL 里的中文。** 一定要 URL 编码（`curl --data-urlencode`，或 JS 里 `encodeURIComponent`）。
- **公司目录 / 面经攻略没有筛选参数。** 全量拉回后在你这边过滤；面经内容本体在外站，只转述元数据并给 `url`，**没有命中就直说，不要编造链接**。注意空值口径：岗位对象用 `null`，公司 / 面经对象用空串 `""`。
- **示例里的日期都要现算。** "最近 N 天"之类的过滤日期用系统当前日期现算（见资讯示例），不要照抄文档里的示例日期。
- **搜索只读；发布受审核限制。** agent 发布端点提交的岗位永远需要审核。审核、拒绝、编辑岗位都是管理员专属，不在本 skill 范围内。
- **URL 不能直接发布。** 用户给链接时，先用 browser-automation skill（`penguin browser`）抓取渲染后的正文再解析；它随桌面应用自带、不用另装，若 `penguin browser status` 报 `unavailable`，就是当前会话不在桌面应用里（见「输入来源与解析」）。
- **同公司多岗位 = 一张卡片。** 用 `positions` 内联成一张卡片发布，不要拆开；不同公司才分卡片。
- **必填项缺失就问，不臆造。** 公司 / 岗位 / 工作类型 / 工作地点 / 联系方式五组必填缺失时，一律停下来请用户补齐，绝不凭空编造（联系方式与地点尤其——猜错地点等于把岗位推给错的人）。
- **limit 上限为 30。** 要拉更多请用 `offset` 分页（精选接口除外——它随机返回，不支持分页）。

## 什么时候不要用这个 skill

- 用户想**自己在网站上填表发布** → 引导他去站点首页（`$OFFERDAO_BASE/`）。只有当用户把 JD / 招聘原文交给*你*、让你代为提交时，才用上面的 agent 发布端点。
- 用户想**审核**（通过 / 拒绝岗位）或**编辑公司目录 / 面经攻略** → 这些是管理员专属，不通过本 skill。
- 用户**还没有 API key** → 先按「第 0 步」看本地 / 环境变量里有没有个人 key；都没有时，**优先**引导去「我的设置 → API keys」创建个人 key。只是查询、又暂时拿不到个人 key，才用 `GET /api/agent/test-key` 领开放测试 key 兜底（领不到会 404）；**发布必须用个人 key**（测试 key 无发布权限）。别试图绕过鉴权。**公司目录、面经攻略、行业资讯不受影响**——没有 key 也照常可查。

## 来源与许可

本 skill 移植自 Offer岛官方的 skill 仓库 [`offerdaoai/skills`](https://github.com/offerdaoai/skills)（MIT 许可，
版权归 Offerdao），取的是提交 `45c2a5d8f83256fe3b53a47c8045f962f61033cd` 下的 `skills/offerdao/`：
正文与 `references/` 三份参考原样搬来，只做 Adelie 化的改动——补了「Before you start」一节、把
`browser-act` 换成 Adelie 的 `browser-automation`（`penguin browser`）、去掉站内卡片块与 daemon 自动更新的约定、
把密钥存到 Agent 密钥库的说法写进去。上游的 MIT 许可证原文就在同目录的 `LICENSE`。

