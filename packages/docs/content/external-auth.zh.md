---
title: 鉴权：外部应用接入
description: 让别的服务用 Adelie 的账号认出「这个人是谁」：服务器间通道的端点、凭证与安全口径，以及今天就能用的替代做法。
---

> [!WARNING]
> 本页写的是 **2026-11-24 的设计稿，尚未实现**：下面的端点、表名和命令都还没进代码，现在照着写接不进去。要让一个外部服务今天就工作起来，用下一节的三种做法之一。实现之后，本页会改成使用文档。

Adelie 的身份层已经在了，见[安全模型](/security)：密码以 scrypt 哈希存储、会话是服务端的一行记录、可撤销、四种凭证各有各的边界。差的只是**对外的一层**：让一个跑在服务器上的外部程序（另一个后端、一个脚本、一个定时任务）能问一句「这把钥匙属于哪个用户」。

这层只回答**身份**（谁、昵称、头像），不回答**能力**（读会话、跑一轮 Agent）。后者一直是 [Agent API](/agent-api) 的活，两者正交，互不替代。

## 今天就能用的三条路

| 做法 | 怎么给 | 边界 |
| --- | --- | --- |
| 共用一把 Agent API key | 外部程序拿 `penguin_…` 调 `POST /api/amsp/v1/agents/:projectId/:agentId/runs` | 这把 key 属于**某个 Agent**，不属于任何用户：它答不了「这个人是谁」 |
| 复用浏览器会话 | 把人登录后的 cookie 交给外部程序（或让它在同一台机器上读 `cli-session.json`） | 等于把整条会话送人；泄漏即等于泄漏那个人，且撤销只能连人一起撤 |
| 本机 API token | 外部程序在**同一台机器**上读 `<root>/api-token` | 只有一把、恒等 `admin`、不区分用户；只适合「能读数据根 = 就是这台机器的主人」的场合 |

三条都不解决「一个外部服务要按用户区分」，所以下面这层要补。

## 设计：两个凭证、三个端点

```
        用户                         外部应用（服务器端）             Adelie
  ┌───────────────┐  ① 人把令牌粘过去  ┌────────────────┐  ③ 内省   ┌───────────┐
  │ 铸一把 PAT     │ ────────────────▶ │ 存进自己的配置   │ ────────▶ │ /oauth/   │
  │ (CLI/管理 API) │                   │ 用它代表这个用户 │ ◀──────── │introspect │
  └───────────────┘                   └────────────────┘  {sub,…}  └───────────┘
                                             │ ② 应用自己的身份
                                             └── client_id + client_secret（认证③）
```

**用户的凭证**：一把个人访问令牌（PAT），形态 `adelie_pat_` + 32 随机字节，**库里只存它的 sha256**，带用途名、范围、到期时间、最后使用时间和撤销位。它不是 cookie，也不会让人进入 Web App 的登录态。

**应用的凭证**：`client_id` + `client_secret`（服务器端程序藏得住 secret）。它存在的理由是内省端点不能裸着：否则任何人拿到一把偷来的令牌都能问「这是谁」，内省还会变成令牌探测器；有了它，撤销可以按应用做，审计能归因到「哪个应用在什么时候用谁的令牌问了什么」。

**三个端点**（都在 `/oauth/*`，用 `application/x-www-form-urlencoded`）：

| 端点 | 谁调 | 干什么 |
| --- | --- | --- |
| `POST /oauth/introspect` | 外部应用（带自己的 client 凭证） | 把 PAT 换成身份 |
| `GET /oauth/userinfo` | 外部应用（`Authorization: Bearer <PAT>`） | 只想拿昵称头像时的直路 |
| `POST /oauth/revoke` | 外部应用或用户 | 撤销一把 PAT |

```bash
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "token=$PAT" https://你的域名/oauth/introspect
# {"active":true,"sub":"lmliheng","name":"李恒","avatar":null,
#  "scope":"openid profile","client_id":"adelie_app_…","exp":"2027-02-22T00:00:00Z"}

# 不存在 / 已过期 / 被撤销 / 不属于这个应用允许的范围 → 都是这一句，不区分：
# {"active":false}
```

应用侧只需三件事：把令牌当机密存、**把内省结果缓存不超过 60 秒**、拿到 `active:false` 就让这个用户重新登录。

### 令牌从哪来（都不需要页面）

```bash
penguin auth token --user lmliheng --name "需求箱" --scope openid,profile --ttl-days 90
# → adelie_pat_…  （只打印这一次）

# 管理员为别人铸（需要人的登录，本机 API token 会被拒）
POST   /api/admin/users/:userId/tokens
# 用户自己看和撤销
GET    /api/me/tokens
DELETE /api/me/tokens/:tokenId
```

令牌形状沿用已有的会话铸造那套（32 随机字节、base64url、只存 sha256，见[安全模型](/security)），只是落在一张自己的表 `user_tokens` 上，而不是 `auth_sessions`——后者是浏览器 cookie 的会话表，改密码或「登出所有设备」会把整片删掉，不该把外部应用的令牌一起带走。另外两张表是应用登记的 `oauth_clients` 与审计的 `oauth_audit`。

### 安全口径

- **TLS 是硬前置**。这套端点收的是别人的令牌；明文 http 下它们裸着过网，cookie 也拿不到 `Secure`。部署在反向代理后面时，Adelie 侧必须设 `ADELIE_TRUST_PROXY=1`，代理自己设置 `X-Forwarded-Proto`（见[安全模型](/security)）。这些端点按规范要求 `https`，只有本机回环地址例外。
- **失败一律 `{"active":false}`**，不区分不存在、过期、被撤、不属于这个应用，否则端点会变成探测器。
- **内省要限流**（按应用计），client 凭证连续失败要退避。
- **范围只允许 `openid profile`**；默认 90 天，最长 1 年。
- **撤销立即生效**：撤令牌、停用账号、删应用，下一次内省就答 `active:false`；唯一的延迟是应用侧那 60 秒缓存。
- **不做密码授权**（把用户的 Adelie 密码交给外部应用）。要浏览器里的「用 Adelie 登录」，属于另一件事——重定向加同意页那套，见仓库里的 OIDC 设计稿。
- **PAT 打不开 `/api/*`**：它回答「谁」，不回答「能做什么」。这是有意的边界。

### 分阶段

| 阶段 | 内容 |
| --- | --- |
| P0 | 三张表（含一条数据库迁移）+ 铸令牌（CLI 三个参数、管理 API）+ `/oauth/introspect` + 审计 |
| P1 | 应用登记与它的管理 API、`/oauth/userinfo`、`/oauth/revoke`、限流 |
| P2 | 签名令牌（JWT）与发现文档，用于离线验签；`client_credentials`（应用自己的身份） |

## 与 Agent API 的分工

[Agent API](/agent-api) 回答「一个程序能不能以某个 Agent 的身份跑一轮」，凭证是每个 Agent 的 key；本页这套回答「这个人是谁」，凭证是每个用户的令牌。一个外部应用通常两个都要：用它自己的 Agent key 干活，用用户的 PAT 判断是谁在让它干。
