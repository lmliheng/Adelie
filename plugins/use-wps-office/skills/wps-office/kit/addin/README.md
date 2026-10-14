# WPS 加载项（面板侧）

这一份是真正传进 WPS 的「在线加载项」：WPS 打开 `http://127.0.0.1:<端口>/addin/index.html`，
页面与桥同源，所以普通的 `fetch` / `EventSource` 就能说话。面板零依赖 —— 原生 ES 模块 + 原生 DOM，
没有框架、没有 CDN、没有外链资源，在 WPS 的任务窗格（Chromium 内核）和普通浏览器里都能跑。

两侧的来源：**桥**是 `kit/serve.mjs`（同一个插件包的另一个目录，负责静态文件、`/addin/*` 指令通道、
`/panel/*` Adelie 代理、`/mcp` 文档工具）；**这一侧**按 `ADDIN-PROTOCOL.md` 写。ribbon 回调的形状、
段落范围取法（`max(Start, End - 1)`）、`Range.Delete()` 之后再写入新文本、`InsertBreak` 的枚举值，
参考了 Apache-2.0 许可的文策 AI（WenCe）WPS 加载项的 `frontend/wps_word_plugin/`（`manifest.xml`、
`public/ribbon.xml`、`src/components/ribbon.js`、`src/components/js/docxJsonConverter.js`）；
代码是按本契约重写的，没有整段搬运，涉及的文件头都写了出处。

## 文件

| 文件 | 做什么 |
| --- | --- |
| `manifest.xml` | WPS JsPlugin 清单：`Name` 为 `Adelie`、`Url` 留空、`IconUrl` 指向 `images/icon.svg`，`Application Name="wps"` 挂 `ribbon.xml` 与一个 420px 的任务窗格 |
| `ribbon.xml` | `customUI`：一个 `btnAdeliePanel` 按钮，回调 `ribbon.OnAddinLoad / OnAction / GetImage` |
| `index.html` | 面板本体（任务窗格那一页，也能在浏览器里独立打开）。所有资源都是相对路径 |
| `panel.js` | `window.ribbon`（WPS 宿主调用）+ 上下文本地报送、命令通道、聊天流、写回文档 |
| `panel.css` | 面板样式，按 `web-design` 规范：单一蓝色强调、浅色/纯黑两套、发丝边框，宽度 380–420px |
| `wps-api.js` | 契约 §3 的九个 `doc.*` 操作，只用白名单里的 WPS API，每个调用 try/catch |
| `stub-wps.js` | 没有 WPS 时假装一个（只给测试和本地调试用），`window.wps` / `window.Application` 都在这里 |
| `images/icon.svg` | 加载项图标：ADELIE 蓝底 + 白色 A。用文本 SVG 而不是 PNG —— 加载项目录会被当文本读进内存，二进制会被 UTF-8 解码破坏 |

## 本地怎么跑、怎么调

```sh
# 1. 用假桥把这一页和它的接口一起发出来（假桥在同一个包的另一处：test/fake-bridge.mjs）
node test/fake-bridge.mjs                      # 默认 127.0.0.1:3891

# 2. 浏览器打开（页面里没有 WPS，会自动 import stub-wps.js）
open http://127.0.0.1:3891/addin/index.html
open 'http://127.0.0.1:3891/addin/index.html?stub=1'   # 就算宿主有 wps 也强制用假实现

# 3. 浏览器冒烟测试（14 条，覆盖 ribbon、命令通道、聊天流、九个文档操作、深浅色）
cd packages/web
npx playwright test -c ../../plugins/wps-office/test/playwright.config.mjs
PANEL_BASE_URL=http://127.0.0.1:3892/ …                # 换端口（同时给 config 和 spec）
```

## 在 WPS 真机上没验证到的地方

- ribbon 的实际呈现：按钮图标（`getImage` 返回相对路径 `images/icon.svg`）、`size="large"` 的排版，
  以及 `CreateTaskPane` / `PluginStorage` / `app.Enum` 在真机上的行为，只能由 Windows + WPS 上跑第一次。
- `app.Selection`：契约 §2.1 要报选区，但 §3 的白名单里没有它，这里按 Word 兼容的
  `app.Selection.Range.Start/End/Text` 读取，读不到就把 `selection` 报成 `null`（不报错）。真机上要确认
  这两个字段是否就是段落定位用的字符偏移。
- `para.Range.End` 是否总是「段落标记之后一格」（替换时按 `End - 1` 留出段落标记）：Word 语义如此，
  文策 AI 的实现也这么用，但 WPS 各版本可能有出入。
- `range.InsertBreak()` 的枚举：优先取 `app.Enum` / `wps.Enum`，取不到就用 `wdLineBreak = 6`、
  `wdPageBreak = 7`、`wdSectionBreakNextPage = 2`。
- `doc.create` 里 `Documents.Add('', false, 0, true)` 的四个参数（老版本会退化到无参数调用）。
