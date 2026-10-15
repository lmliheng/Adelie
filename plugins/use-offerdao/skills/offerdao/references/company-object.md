# 公司对象参考（`GET /api/companies` 返回的 `items` 元素）

> 配套 SKILL.md 的「公司目录」一节。这里是完整结构；用法与示例看 SKILL.md 本体。

```jsonc
{
  "company_id": "company_xxxxxxxx",
  "name": "某 AI 公司",
  "logo_url": "data:image/jpeg;base64,..." | "",   // ⚠️ 可能很大；转述 / 输出时一律置 null，勿照搬
  "website_url": "https://..." | "",
  "company_tag": "国内大厂" | "",   // 公司代表性标签，同岗位搜索的 5 值枚举：国内大厂 / 知名外企 / 独角兽 / 知名初创 / 明星团队
  "stage": "A 轮" | "",             // 阶段（如融资轮次），管理员手输的短文本
  "tags": ["AI Infra", "Agent"],    // 自由短标签数组
  "location": "北京" | "",
  "company_intro": "..." | "",      // 公司简介
  "team_intro": "..." | "",         // 团队简介（同时会作为 team_members 首条的 title 展示）
  "team_members": [                 // ≤20 条
    { "name": "张三", "title": "创始人 / CEO", "links": { "x": "https://x.com/...", "...": "..." } }
  ],
  "funding_rounds": [ /* 融资轮次列表，≤20 */ ],
  "products": [ /* 产品列表，≤20；非空时 product_intro 为空串 */ ],
  "product_intro": "..." | "",      // 产品简介（与 products 二选一）
  "news_links": [ /* 相关报道外链，≤20 */ ],
  "interview_links": [ /* 该公司相关的面经外链，≤20 */ ],
  "open_position_ids": [ /* 管理员显式关联的岗位 id；为空时按公司名自动匹配 */ ],
  "open_positions": [ /* 在招岗位精简版，≤8 条，按发布时间倒序，见下 */ ],
  "visible": true,
  "created_at": 1750000000,         // unix 秒
  "updated_at": 1750000000
}
```

## `open_positions` 精简岗位结构

```jsonc
{
  "posting_id": "manual_xxxxxxxx",
  "organization": "某 AI 公司",
  "role": "LLM 训练工程师",
  "employment_type": ["正式"],
  "location": "北京",
  "published_at": "2026-06-12",
  "published_ts": 1749686400,
  "fetched_at": null,              // 公开返回里恒为 null（内部字段已剥离），排序用 published_ts
  "positions": "..." | null        // 同岗位对象：多岗位时是 JSON 字符串，需 JSON.parse
}
```

- 这是精简版，**不含** JD 正文与联系方式。**搜索接口没有按 `posting_id` 查询的参数**——要完整信息，按 `organization` 搜索后在结果里对 `posting_id` 匹配，或直接给用户岗位短链 `$OFFERDAO_BASE/j/<posting_id>`（详情页本身信息完整）。
- `open_positions` 有两种来源：管理员显式指定（`open_position_ids` 非空时按 id 取），否则按公司名自动匹配已审核岗位。最多返回 8 条——该公司实际在招岗位可能更多，全量请用搜索接口按 `organization` 查。

## 空值口径提醒

公司 / 面经对象的空值是**空串 `""`**，岗位对象的空值是 **`null`**——跨接口复用同一个 jq / 代码过滤器时要分别处理。另外公司的 `logo_url` 仍可能是内联的大 base64（与岗位不同——岗位在公开返回里已换成图片端点 URL），转述时一律置 null。
