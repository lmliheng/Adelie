# 同步预置补上的模型直接沿用分组里已有的 key，不再显示「未配置密钥」

- **Date:** 2026-10-30
- **Type:** fix
- **Scope:** `server`, `docs`
- **Breaking:** no

[English](2026-10-30-preset-key-follows-the-group.md)

**同步预置**会把项目还没有的目录模型补进模型表。网关分组（TokenDance、OpenRouter、Fireworks AI、
SiliconFlow、两个 Qwen 网关、ModelScope）里所有条目都由同一个端点、同一个登录来应答，所以缺 key 的预置
会显示成没配密钥，在一排能用的条目旁边连自己的测速都过不了，唯一的办法是把同一把 key 再粘一遍。现在保存
模型表时，这样的条目会直接沿用分组里已经有的那把 key——一次粘贴就能把整组配好。

## 细节

- `packages/server/src/services/project-config-service.ts`：`groupApiKey(pool, provider, baseUrl)` 给出缺
  key 的条目可以沿用的那把——**同一个分组、同一个 base URL** 下唯一的 `api_key`；组内那把 key 不唯一时
  返回空。同一分组下有两把不同的 key，说明是两个账号（或有意的拆分）；base URL 不同就是另一个服务。这两种
  情况都维持原样、留空，而不是替你猜一个。
- 判断用的那张「池子」是**已存的表加上这一次请求自己带来的 key**。模型页每次保存都写整张表，带 key 的那条
  可能在要借的预置之前，也可能在它之后，两边都算进去，结果才与顺序无关。
- 只有内置目录里的条目会借。你自己添加的模型保持原有语义：不带 key 替换它，等于凭证不迁移。
- **清除已存 API key** 仍然有效：明确要求留空的条目不会被旁边的条目填回来。
- 测试：`packages/server/test/models.test.ts` 新增四条——借 key 本身（响应里始终没有明文）、组内两把不同
  的 key、明确清除、以及指向别的端点或自己添加的条目。
- 文档：`packages/docs/content/models.{en,zh}.md` 的「同步预置模型」原先写「绝不动 API key」，现在把那一处
  例外写清楚。

## 兼容性

- 无破坏性改动：协议、DTO、文件布局都没变。本来有 key 的条目照旧，只有「组内只有一把 key」这一种情况才会
  填，明确清除依然生效。
- key 不离开服务端：沿用只写进 `.project_config.toml`，响应里仍然只有打码后的值。
