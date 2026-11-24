---
title: 鉴权：外部应用接入
description: 让别的服务用 Adelie 的账号认出「这个人是谁」：服务器间通道的端点、凭证与安全口径。
---

Adelie 的身份层已经在了，见[安全模型](/security)：密码以 scrypt 哈希存储、会话是服务端的一行记录、可撤销、四种凭证各有各的边界。这一页讲**对外的一层**：让一个跑在服务器上的外部程序（另一个后端、一个脚本、一个定时任务）能问一句「这把钥匙属于哪个用户」。

这层只回答**身份**（谁、昵称、头像），不回答**能力**（读会话、跑一轮 Agent）。后者一直是 [Agent API](/agent-api) 的活，两者正交，互不替代。

> [!NOTE]
> 这套是**只有服务器端**的通道：外部应用是服务器上的程序，Adelie 这边**没有新增任何页面**——铸令牌走 CLI 或管理 API，应用登记走管理 API，其余全是 HTTP 端点。要「人在浏览器里点『用 Adelie 登录』」，那是重定向加同意页那件事，仓库里另有一份 OIDC 设计稿，不在本页范围。

## 两个凭证、三个端点

```
        用户                         外部应用（服务器端）             Adelie
  ┌───────────────┐  ① 人把令牌粘过去  ┌────────────────┐  ③ 内省   ┌───────────┐
  │ 铸一把 PAT     │ ────────────────▶ │ 存进自己的配置   │ ────────▶ │ /oauth/   │
  │ (CLI/管理 API) │                   │ 用它代表这个用户 │ ◀──────── │introspect │
  └───────────────┘                   └────────────────┘  {sub,…}  └───────────┘
                                             │ ② 应用自己的身份
                                             └── client_id + client_secret（认证③）
```

**用户的凭证**是一把个人访问令牌（program token，PAT）：形态 `adelie_pat_` + 32 随机字节，**库里只存它的 sha256**，带用途名、范围、到期时间、最后使用时间与撤销位。它不是 cookie，也不会让人进入 Web App 的登录态。

**应用的凭证**是 `client_id` + `client_secret`（服务器端程序藏得住 secret）。它存在的理由是内省端点不能裸着：否则任何人拿到一把偷来的令牌都能问「这是谁」，内省还会变成令牌探测器；有了它，撤销可以按应用做，审计能归因到「哪个应用在什么时候用谁的令牌问了什么」。

**三个端点**（都在 `/oauth/*`，用 `application/x-www-form-urlencoded`）：

| 端点 | 谁调 | 干什么 |
| --- | --- | --- |
| `POST /oauth/introspect` | 外部应用（带自己的 client 凭证） | 把 PAT 换成身份 |
| `GET /oauth/userinfo` | 外部应用（`Authorization: Bearer <PAT>`） | 只想拿昵称头像时的直路 |
| `POST /oauth/revoke` | 外部应用 | 撤销它拿到的这把 PAT |

```bash
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "token=$PAT" https://你的域名/oauth/introspect
# {"active":true,"sub":"lmliheng","username":"lmliheng","name":"李恒","avatar":null,
#  "scope":"openid profile","client_id":"adelie_app_…","exp":"2027-02-22T00:00:00Z"}

# 不存在 / 已过期 / 被撤销 / 账号没了 / 不属于这个应用允许的范围 → 都是这一句，不区分：
# {"active":false}
```

应用的凭证用 HTTP Basic 送（`curl -u`），也可以放在表单字段 `client_id` / `client_secret` 里。**凭证不对是 401**；令牌那边的任何情况都折合成同样一句 `{"active":false}`。

应用侧只需三件事：把令牌当机密存、**把内省结果缓存不超过 60 秒**、拿到 `active:false` 就让这个用户重新登录。

## 人怎么拿到那把令牌

三种口，都不需要页面。

```bash
# ① CLI（在数据根那台机器上；不需要服务在跑）
penguin auth pat --user-id lmliheng --name "需求箱" --scope openid,profile --ttl-days 90
# → adelie_pat_…  （只打印这一次）
```

```text
② 管理员的 HTTP 口（给没有终端的人 / 想脚本化的场合）
POST   /api/admin/tokens                    { userId, name, scope?, ttlDays? } → { token, entry }
GET    /api/admin/tokens?userId=<id>        列表（只有 prefix / name / scope / 到期 / 最后使用 / 是否已撤）
DELETE /api/admin/tokens/:tokenId           撤销

③ 用户自己看和撤销自己的
GET    /api/me/tokens
DELETE /api/me/tokens/:tokenId
```

② 只有管理员能用，在桌面模式（单用户）下整个不提供；**铸和撤这两笔还要求操作者本人的登录**——本机的 API token（`<root>/api-token`）会被拒（403 `human_required`），因为它是交给 Agent 子进程的凭证，不该能替人发一把对外钥匙。

### 外部应用怎么登记

管理员登记一个应用，拿到 `client_id` 和 `client_secret`（secret 只显示这一次）：

```text
POST   /api/admin/oauth-clients        { clientName, scopes? } → { clientId, clientSecret, entry }
GET    /api/admin/oauth-clients        列表（只有 secret 前缀，没有 secret 本身）
POST   /api/admin/oauth-clients/:clientId/disable    停用（此后它的内省一律 401）
```

`scopes` 是这个应用最多能要的范围，默认 `openid profile`；令牌的范围必须落在这个应用登记的范围之内，否则内省答 `active:false`。

## 数据表

三张表，随一条数据库迁移（`PRAGMA user_version` 到 17）建好：

- `user_tokens`：上面那把 PAT。**没有塞进 `auth_sessions`**——后者是浏览器 cookie 的会话表，改密码或「登出所有设备」会把整片删掉，不该把外部应用的令牌一起带走；两者生命周期不同，撤销方式也不同。
- `oauth_clients`：应用登记（client_id、secret 的 sha256、范围、停用位）。
- `oauth_audit`：每次内省、撤销、铸令牌都写一行，**失败也写**——失败的那些才是要看的。这张表不带外键，账号或应用删了，记录还在。

## 安全口径

- **TLS 是硬前置**。这套端点收的是别人的令牌；明文 http 下它们裸着过网，cookie 也拿不到 `Secure`。部署在反向代理后面时，Adelie 侧必须设 `ADELIE_TRUST_PROXY=1`，代理自己设置 `X-Forwarded-Proto`（见[安全模型](/security)）。开发期留在本机回环地址即可。
- **令牌只存 sha256**，明文只在铸造那一次出现；前缀 `adelie_pat_` / `adelie_app_` 让泄漏的钥匙一眼认得出。
- **失败一律 `{"active":false}`**，不区分不存在、过期、被撤、账号没了、范围不符，否则端点会变成探测器。
- **内省按应用限流**（默认可观的上限是每分钟 60 次，超了 429 并写审计）；client 凭证连续失败会退避。
- **范围只允许 `openid profile`**；默认 90 天，上限 1 年，`--ttl-days 0` 才不过期。
- **撤销立即生效**：撤令牌、停用应用、删账号，下一次内省就答 `active:false`；唯一的延迟是应用侧那 60 秒缓存。
- **PAT 打不开 `/api/*`**：它回答「谁」，不回答「能做什么」。这是有意的边界——要给它 API 能力，是单独一个范围加一次单独评审的事。
- **不加 CORS**：服务器之间调用不经过浏览器，一个 `Access-Control-Allow-Origin` 都不发。
- **不做密码授权**（把用户的 Adelie 密码交给外部应用）：那等于把密码搬到每个接入的应用里。要浏览器里的「用 Adelie 登录」，属于另一件事。

## 还没做的

| 项 | 说明 |
| --- | --- |
| 签名令牌（JWT）与发现文档（`/.well-known/openid-configuration`、`/oauth/jwks.json`） | 供「离线验签、不想依赖 Adelie 在线」的场合；它和现在的内省共用同一张表、同一把令牌 |
| `client_credentials`（应用自己的身份，`sub` 形如 `app:adelie_app_…`） | 夜里跑的同步任务这类，没有用户可代表 |
| 浏览器里的重定向登录与同意页、device code | 要页面，属于 OIDC 那件事 |

## 与 Agent API 的分工

[Agent API](/agent-api) 回答「一个程序能不能以某个 Agent 的身份跑一轮」，凭证是每个 Agent 的 key（`penguin_…`）；本页这套回答「这个人是谁」，凭证是每个用户的 PAT（`adelie_pat_…`）。一个外部应用通常两个都要：用它自己的 Agent key 干活，用用户的 PAT 判断是谁在让它干。
