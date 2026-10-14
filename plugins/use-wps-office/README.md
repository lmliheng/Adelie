# WPS（`@lmliheng/use-wps-office`）

把 Adelie 的对话搬进 **WPS 文字**：功能区多一个「Adelie」按钮，点开是侧栏——问它、让它读、让它改
当前这篇文档；同一套文档操作也作为 MCP 工具交给 Agent（`mcp__wps__*`）。

运行时就是一个**零依赖的 Node 文件**（`skills/wps-office/kit/serve.mjs`）。它同时是四样东西：

| 身份 | 接口 | 干什么 |
| --- | --- | --- |
| 面板的宿主 | `GET /addin/*` | 发加载项那一页（WPS 以「在线加载项」加载这个目录） |
| Agent 的手 | `GET /addin/commands`（SSE）+ `POST /addin/result`，以及 `POST /mcp` | 把文档操作下发给面板执行，一次只跑一条；同一个操作也作为 MCP 工具给 Adelie |
| Adelie 的客户端 | `GET /panel/state|history|events`，`POST /panel/session|ask|approve|abort` | 面板的对话；把 Adelie 的流归一成面板认识的几种事件 |
| WPS 的安装按钮 | `GET /publish`、`POST /publish/enable|disable` | 通过 WPS 自己的本机上架服务（`127.0.0.1:58890`）登记加载项 |

**为什么要中间这个桥**：面板跑在 WPS 的内嵌浏览器里，与 Adelie 不同源，而 Adelie 明确不开 CORS
（仅限同源）。桥就是那个「另一个源」——面板只跟它说话，它再跟 Adelie 说话。全程只走 `127.0.0.1`。

## 装

```bash
node skills/wps-office/kit/install.mjs
```

它写设置、把加载项交给 WPS（这一步 WPS 要开着）、把桥登记成 Agent 的一个 MCP 服务器并自检、
在 Windows 上放一个开机自启的 `.cmd`、然后把桥拉起来。**每一步都可以重复跑，重跑就是修复。**

诊断页：`http://127.0.0.1:3891/status`；安装按钮那一页：`/publish`。文件都在数据根的
`wps-bridge/`（设置、状态、`bridge.log`）——**不放插件目录**，因为插件更新会整体替换。

卸载：`node skills/wps-office/kit/uninstall.mjs`（加 `--purge` 连日志一起删）。

## 文件

| 路径 | 是什么 |
| --- | --- |
| `skills/wps-office/kit/serve.mjs` | 桥，也是这个插件的全部运行时 |
| `skills/wps-office/kit/adelie.mjs` | 找 Adelie、带令牌调它的 HTTP 客户端（`install.mjs` 也用） |
| `skills/wps-office/kit/wps.mjs` | WPS 本机上架服务（58890）的客户端 |
| `skills/wps-office/kit/install.mjs` / `uninstall.mjs` | 装与卸 |
| `skills/wps-office/kit/addin/` | 加载项本身：`manifest.xml`、`ribbon.xml`、面板页与文档操作层 |
| `skills/wps-office/SKILL.md` | Agent 读的说明书 |
| `test/` | 桥、安装脚本、加载项托管、面板冒烟四组测试 |

## 测试

```bash
node --test plugins/use-wps-office/test/          # 桥、安装脚本、加载项托管（不需要浏览器）
cd packages/web && npx playwright test -c ../../plugins/use-wps-office/test/playwright.config.mjs
                                                  # 面板在 Chromium 里真的跑一遍（14 条）
```

面板那组跑的时候 `stub-wps.js` 会顶掉 WPS：假文档、假 Range、假任务窗格接口，所以没有 WPS 的
机器也能验。**真机上没验过的**：ribbon 按钮图标呈现、`CreateTaskPane`/`PluginStorage`/`app.Enum`
的真实行为、`app.Selection` 的字符偏移、`Documents.Add` 四参数的老版本兼容、IME 回车。这些只能
在 Windows + WPS 上跑第一次。

## 来源

加载项的清单形状、ribbon 回调写法、`InsertBreak` 的位置取法（段落标记之前一格）参考了 Apache-2.0
的文策 AI（`visresearch/WordAgent`，`frontend/wps_word_plugin/`）与其发布页
（`backend/gui/resources/publish.html`，58890 那套接口的出处）；代码按本项目的契约重写，没有整段搬运。
