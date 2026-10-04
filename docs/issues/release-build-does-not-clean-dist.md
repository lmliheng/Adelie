---
title: "release: build 不清 dist，已删源的文件会被打进发布包"
labels: [bug, scope:release, P2]
---

## 现象

`packages/providers/dist/` 里还留着 `anthropic.provider.js` / `gemini.provider.js`（以及
对应的 `.d.ts`、`.map`）：这两个源文件在 `d3024f5`（P1）就被删掉了，但产物还在。

```
$ ls packages/providers/dist/ | grep -E 'anthropic|gemini'
anthropic.provider.d.ts
anthropic.provider.js
gemini.provider.d.ts
gemini.provider.js
```

## 复现

```bash
cd /root/Adelie && pnpm build && ls packages/providers/dist/ | grep -E 'anthropic|gemini'
```

## 期望

`pnpm build` 先清空 `dist` 再编译，产物只反映当前源码。

## 影响

`packages/providers/package.json` 的 `files` 是 `["dist", "README.md"]`，所以
`scripts/publish-packages.sh` 打出的 npm 包里会带上这两个 57 字节的空壳文件。
它们不被任何代码 import，后果只是「下载到的包里有一份不存在的适配层」——
目前的伤害是困惑，不是故障。

## 证据

- `packages/providers/package.json` 的 `build` 脚本是 `tsc -p tsconfig.build.json`，
  没有清理步骤；`files: ["dist", ...]`
- 发现于 P2 收尾时的文档校对（2026-10-04），当时未改，因为不属于 P2 的范围
