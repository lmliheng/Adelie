# 腾讯 TokenHub 分组显示的是它自己的标记，不再是一个字母方块

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `ui`

[English](2026-11-24-tokenhub-logo.md)

昨天加进模型库的 **Tencent TokenHub** 分组，在模型库与模型选择器里以前画的是一块灰底字母牌「T」
（和自建分组一样），现在画的是它自己的标记：腾讯云的云朵标 —— 这个分组的 key 本就属于腾讯云账号 ——
同一行列里它和别的服务商图标一样是单色，跟随浅色/深色主题。

## 细节

- `packages/ui/src/components/icons/logos/provider-logo.tsx`：`GLYPHS` 新增 `tokenhub` 一条 ——
  三条 `evenodd` 路径，`fillRule`/`clipRule` 一并保留（去掉规则会让云朵里的镂空填实，整枚标记糊成
  一团），颜色由 `currentColor` 给，和其他预置服务商一致。它紧跟在 `tencent` 后面，而 `tencent`
  画的是混元的圆环 —— TokenHub 是另一个服务商，同一行列里两行不该看起来像一家。
- 标记取自 `@lobehub/icons` 以 `TencentCloud` 发布的那一份。**没有自己描**：TokenHub 自己的控制台
  与产品页对这台机器只回一个验证码壳（HTTP 200、里面没有 logo），而照着一张截图手搓商标比原来的字母牌
  更糟。也没有新增依赖，只把三条路径拷进来 —— 这个文件一直是「纯路径、无外部图片资源」。
- `packages/ui/test/logos.test.ts`：新增一条断言，`tokenhub` 画的是三条 `evenodd` 路径而不是字母牌，
  且它的画法不是 `tencent` 那一行。

## 兼容性

只多一个图标。数据根、接口形状与模型目录都没变；用到的字体或图片资源没有增加。
