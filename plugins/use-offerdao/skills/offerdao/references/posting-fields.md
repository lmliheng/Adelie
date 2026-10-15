# 岗位字段参考（搜索返回 & 发布提交）

> 配套 SKILL.md 的「搜索岗位」与「发布岗位」两节。这里是逐字段的完整参考，需要核对某个字段的类型 / 约束时再读；高频用法与流程看 SKILL.md 本体。

## 一、岗位对象完整结构（搜索 / 精选返回的 `items` 元素）

```jsonc
{
  "posting_id": "manual_xxxxxxxx" | "agent_xxxxxxxx" | "<系统生成 id>",
  "source_url": "https://example.com/jobs/..." | "<主页>",
  "organization": "字节跳动",
  "team": "Seed",                  // 可选
  "role": "多模态算法工程师",
  "employment_type": ["正式"],     // 字符串数组；多岗位卡片只含 positions[0] 的类型（见下「过滤口径注意」）
  "role_tags": ["CV", "Infra"],    // 字符串数组，≤ 5
  "company_tag": "国内大厂" | null,   // 管理员维护，搜索可按它精确过滤
  "location": "北京 / 上海",
  "intro": "...",                  // 简短简介
  "description": "...",            // JD 正文
  "requirements": "...",           // 招聘要求
  "contact_email":  "a@b.com" | null,
  "contact_wechat": "wx_id" | null,
  "contact_xiaohongshu": "https://www.xiaohongshu.com/user/..." | null,   // 小红书号 / 主页
  "contact_link":   "https://..." | null,
  "referral_code": "ABC123" | null,
  "logo_url": "/api/postings/<id>/logo?v=xxxx" | "https://..." | null,
                                   // 相对路径时拼上 $OFFERDAO_BASE 即为可用的图片地址
  "positions": "[ {role, employment_type[], description, requirements}, ... ]" | null,
  "published_at": "2026-05-12",   // 可解析时为 YYYY-MM-DD
  "published_ts": 1747008000,     // unix 秒，无法解析时为 null
  "poster_type": "HR" | null,      // 发布者身份标签
  "valid_period": "长期" | null,    // 有效期标签（发布者可选设置）
  "featured": false,               // 是否「岛上精选」
  "saved_count": 0,                // 被收藏次数
  "view_count": 12,                // 浏览次数
  "show_owner": false,             // 发布者是否选择展示个人资料
  "owner_profile": null,           // show_owner 为 true 时是发布者公开资料对象，否则 null
  "review_status": "approved",     // 公开接口恒为 approved
  "reviewed_at": 1747009000,
  "renewed_at": null
}
```

两条容易记错的：

- **没有 `contact` 自由文本字段，也没有 `fetched_at`**。联系方式只有上面四个 `contact_*` 结构化字段；`sort_by=fetched` 仍可用（服务端按抓取时间排序），只是该时间戳不随响应返回。
- `featured` / `saved_count` / `view_count` / `review_status` / `reviewed_at` / `renewed_at` / `show_owner` 是平台展示字段，转述岗位时一般忽略。

### `positions` 的解析

多岗位的招聘，`positions` 是一个 **JSON 字符串**——需要 `JSON.parse` 解析。单岗位的招聘 `positions` 为 `null`，直接用顶层的 `role` / `description` / `requirements`。

### 过滤口径注意（多岗位卡片）

顶层 `employment_type` 只取 `positions[0]` 的类型，而搜索的 `employment_type` 过滤器只匹配顶层字段——混合类型的卡片（如第一个子岗位「正式」、第二个「实习」）用 `employment_type=实习` 会被漏掉。要全覆盖改用 `q`（它也匹配 `positions` 的内容），拿回结果后再逐个核对子岗位的类型。

### `company_tag` 的口径

搜索按 `company_tag` 过滤时**带公司继承**：除自身显式标了该值的岗位外，也会带出「自身没标、但所属公司的代表性标签正是该值」的岗位——所以返回结果里可能出现 `company_tag` 为 `null` 的岗位，这是预期行为（与卡片上展示的公司徽章口径一致）。

## 二、发布字段全表（`POST /api/postings/agent`）

### 必填（四组）

> 此表与 SKILL.md「字段（必填四组）」保持一致，改动需同步两处。

任何一组缺失，先问用户补齐再发布。**绝不要编造**任何值（联系方式尤其不能凭空捏造）：

| 字段 | 类型 | 用途 / 约束 |
|---|---|---|
| `organization` | string | **必填。** 公司 / 学校 / 机构名称。 |
| `role` | string | **必填（单岗位）。** 岗位名称。多岗位时改用 `positions`，并省略顶层 `role`。 |
| `employment_type` | string[] | **必填。** 工作类型，至少一个。常见值：`正式` / `实习` / `访问` / `研究助理` / `PhD` / `Postdoc`。每项 ≤16 字符。 |
| 联系方式（四选一） | — | **至少填一个**：`contact_email` / `contact_wechat` / `contact_xiaohongshu` / `contact_link`（`contact_link` 会被服务端做可达性探测，选**公网可达**的链接，失效 / 登录墙链接会被拒）。 |

### 可选（JD 里有就填，没有就留空，不要猜）

| 字段 | 类型 | 用途 / 约束 |
|---|---|---|
| `contact_email` | string | 招聘邮箱，必须是合法邮箱格式。 |
| `contact_wechat` | string | 招聘微信号，≥2 字符。 |
| `contact_xiaohongshu` | string | 小红书号或主页链接，≤80 字符。 |
| `contact_link` | string | 投递 / 岗位链接，必须以 `http(s)://` 开头；服务端会做**可达性探测**——选公网可达的链接，登录墙 / App 专属链接可能被拒。 |
| `team` | string | 团队 / 部门（如 `Seed`）。 |
| `intro` | string | 列表卡片上展示的一句话简介。 |
| `description` | string | JD 正文。 |
| `requirements` | string | 招聘要求。 |
| `location` | string | 工作地点。**只有确实有多个地点时**才用 `/` 分隔（如 `北京 / 上海`）；单个地点直接写（如 `北京`），不要带斜杠；地点未知就**省略该字段**，不要传 `/`、`远程 /` 这类残缺值。 |
| `source_url` | string | 原帖 / 主页链接，必须以 `http(s)://` 开头（不做可达性探测）。建议填，方便审核人核对来源。 |
| `role_tags` | string[] | 岗位标签，≤5 个，每个 ≤7 字符（如 `["CV", "多模态"]`）。被 `role_tag` 搜索过滤器使用。 |
| `referral_code` | string | 内推码，≤64 字符。 |
| `poster_type` | string | 发布者身份标签（如 `HR` / `内推`），≤24 字符。agent 代发通常无需填写。 |
| `positions` | object[] | **多岗位**：每项 `{ role*, employment_type*[], description, requirements }`。存在时，顶层 `role` / `employment_type` 取自 `positions[0]`；每个岗位都需要至少一个 `employment_type`。 |
| `logo_url` | string | 品牌 logo 的 `data:image/...` URL，≤256KB。通常省略。 |

### 不可设置的字段

**`company_tag`（公司类型）不能由 agent / 发布接口设置**——它是管理员审核时在后台设定的编辑字段，发布时即使带上也会被服务端**静默忽略**。它只用于搜索接口的精确过滤，合法值（枚举，由管理员维护）：`国内大厂` / `知名外企` / `独角兽` / `知名初创` / `明星团队`。
