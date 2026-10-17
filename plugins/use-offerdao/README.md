# Offer岛（`@adelie/use-offerdao`）

把 **Offer岛**（[offerdao.ai](https://offerdao.ai)，聚合 AI 行业招聘信息的平台）接进 Adelie：一个 skill
教会 Agent 用它的开放 API 找岗位、看公司、翻面经、读每日 AI 资讯，也能把你给的 JD 原文或帖子链接
解析成结构化岗位替你提交（提交后进平台审核）。

| 能力 | 端点 | 鉴权 |
| --- | --- | --- |
| 搜索岗位 | `GET /api/postings/search` | 需 key |
| 岛上精选 | `GET /api/postings/featured` | 需 key |
| 发布岗位 | `POST /api/postings/agent` | 需 key（必须是个人 key） |
| 公司目录 | `GET /api/companies` | 公开 |
| 面经攻略 | `GET /api/guides` | 公开 |
| 行业资讯 | `GET /news/md/*`、`GET /api/news/feed` | 公开 |

公司目录、面经攻略、行业资讯**不需要 key**，装上就能用；搜索与发布需要一把 Offer岛的 key。

## 装

在 Adelie 的**插件库**页面上找 `use-offerdao` 安装到某个 Agent（它不是默认预装的插件）。
装完让用户把 key 加进该 Agent 的**密钥库**，条目名：

```
OFFERDAO_API_KEY
```

Agent 会按「环境变量 → 本机 `~/.offerdao/config.json`（装过 Offer岛本地 daemon 就有）→ 请用户提供」
的顺序找这把 key。密钥只留本机，不进任何提交、日志或邮件。

## 文件

| 路径 | 是什么 |
| --- | --- |
| `skills/offerdao/SKILL.md` | Agent 读的说明书：端点、字段、发布流程、限流与错误处理 |
| `skills/offerdao/references/` | 按需加载的字段全表（岗位发布字段、公司对象、资讯格式） |
| `skills/offerdao/LICENSE` | 上游 skill 的 MIT 许可证原文 |

## 来源

SKILL.md 与 `references/` 移植自 Offer岛官方的 skill 仓库
[`offerdaoai/skills`](https://github.com/offerdaoai/skills)（MIT，版权归 Offerdao），取的是提交
`45c2a5d8f83256fe3b53a47c8045f962f61033cd` 的 `skills/offerdao/`。Adelie 化了四处：补了
「Before you start」一节、`browser-act` 换成本仓库的 `browser-automation`（`penguin browser`）、
去掉站内卡片块与 daemon 自动更新那套约定、把密钥存进 Agent 密钥库的说法写进去。上游的 MIT 许可证
`skills/offerdao/LICENSE` 随内容一起分发。
