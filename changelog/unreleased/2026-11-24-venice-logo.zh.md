# Venice AI 分组显示的是它自己的标记，不再是一个字母方块

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `ui`

[English](2026-11-24-venice-logo.md)

模型库与模型选择器里，**Venice AI** 那一组以前画的是一块灰底字母牌「V」（和自建分组一样），现在画
的是它自己的标记：两把交叉的钥匙，上方一枚展开的翼。同一行列里它和别的服务商图标一样是单色，跟随
浅色/深色主题。

## 细节

- `packages/ui/src/components/icons/logos/provider-logo.tsx`：`GLYPHS` 新增 `venice` 一条 ——
  两条 `evenodd` 路径（标记主体与它上方那枚小翼），`fillRule`/`clipRule` 一并保留（去掉规则会让
  钥匙环里的镂空填实，整枚标记糊成一团），颜色由 `currentColor` 给，和其他预置服务商一致。
- 标记取自 `@lobehub/icons` 为 Venice AI 发布的那一份。**没有自己描**：厂商站点（`venice.ai`）在
  这台机器上连不上（连接超时，`icon.svg` 与文档站都一样），而照着一张截图手搓商标比原来的字母牌更糟。
  也没有新增依赖，只把两条路径拷进来 —— 这个文件一直是「纯路径、无外部图片资源」。
- `packages/ui/test/logos.test.ts`：新增一条断言，`venice` 画的是实心路径而不是字母牌，且
  `fill-rule="evenodd"` 两条都在。

## 兼容性

只多一个图标。数据根、接口形状与模型目录都没变；用到的字体或图片资源没有增加。
