---
title: "server: PATCH /api/config 的平铺 provider 兼容分支是临时的"
labels: [欠账, scope:server, P3]
issue: 7
---

## 欠了什么

`packages/server/src/routes/config.ts` 里有一段 0.1 兼容：

```ts
} else if (body['provider'] !== undefined) {
  // 兼容 0.1：老客户端只发 `provider`。手机上装过的 PWA 缓存着旧前端，
  // 它还会这样发 —— 为一句字段改名把老客户端踹回设置页，不值得。
  // 等确认线上没有 0.1 的客户端之后再删这一段。
  const parsed = parseModelPatch({ provider: body['provider'] }, next.model);
```

它让 `PATCH {"provider":"kimi"}` 与 `PATCH {"model":{"provider":"kimi"}}` 等价。
留着它的代价是：契约里有两个真话（`docs/api.md` §2 得为它专门写第 3 条规则），
以后每改一次模型字段都要记得「还有一条老路」。

## 为什么当时这么办

PWA 是可安装的，装了它的手机浏览器会缓存旧前端外壳；旧外壳发的正是平铺字段。
删掉这段不会让旧外壳报错 —— 它只会静静地不生效（界面显示切了、服务端没切），
那比 400 更难查。

## 什么条件下该还

「确认线上没有 0.1 客户端」这句话要能落地成动作，否则它永远不成立。可判定的条件：

1. 下一个版本（v0.2.0）发布**满 30 天**，且
2. 这三处都没有 0.1 的 `User-Agent` / PWA 外壳版本上报（现在服务端**没有**上报，
   要还这条债得先加一个「前端版本」字段 —— 加之前这条一直开着，这是有意为之）。

在那之前：保留，但 `docs/api.md` 与代码注释里都必须写明它是临时的。

## 证据

- `packages/server/src/routes/config.ts:91-98`
- `docs/api.md` §2 的第 3 条规则
