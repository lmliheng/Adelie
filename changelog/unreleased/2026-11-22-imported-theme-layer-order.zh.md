# 导入过主题的安装里，主题反被应用自身样式盖住

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `web`

[English](2026-11-22-imported-theme-layer-order.md)

只要这台机器导入过至少一套主题，主题自己的配方就会输给应用自身的工具类：内边距被压平、主题特意
关掉的边框又回来了、主题藏起来的标记照样画出来。表现出来是消息面板那条通知——它的 `[WARN]` 标签
压在正文上面而不是站在正文前面——以及极客主题看着是直角的圆角。

根子在层叠层的顺序。一组层名的先后由「每个名字**第一次**出现的位置」决定，而服务端用导入的主题
拼出来的那张表（`GET /api/themes.css`）带着 `@layer ui-theme`。这张表必须排在最前，登录页才能也
画上用户自己的主题——于是 `ui-theme` 成了文档里第一个被点名的层，也就是最低的一层。接下来每条主
题配方都输给 Tailwind：`.px-4` 压过配方的 `padding-inline-start`，`.border` 压过它的 `border: 0`，
`.flex` 压过 `[data-slot=icon] { display: none }`。而 `::before` 那个标签没有对手，照样被画出来
——就压在正文上。

现在由页面头部自己把这套顺序说死，排在主题表之前：

```html
<style>@layer properties, theme, base, components, utilities, ui-theme, ui-accent, ui-font;</style>
```

这样无论两张表按什么顺序加载，整个文档的层序都定住了，构建产物与开发服务器都一样。工具类仍然排在
主题各层之下——这也正是应用自身样式表本来就定好的关系。

## 细节

- `packages/web/index.html`：这条带顺序的 `@layer` 声明放在头部、紧挨着 `/api/themes.css` 链接的
  前面，并附注释说明它为什么必须排在最前。
- `packages/web/test/head-layers.test.ts`（新增）：把这条声明钉住——它存在、排在主题链接之前，且
  把 `ui-theme`（连同 `ui-accent`、`ui-font`）排在 `utilities` 之后。

## 兼容性

这条声明只是把应用自身样式表本来就想要的层序落实下来；没导入主题的安装不受影响。数据根、Trace
格式与接口形状都没变。
