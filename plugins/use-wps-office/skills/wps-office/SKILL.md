---
name: wps-office
description: Put an Adelie conversation inside WPS Writer — a side panel in WPS that talks to an Adelie session, and nine document operations (summary, read, search, replace, insert, delete, break, create, reveal) exposed to the Agent as MCP tools so it can work on the document that is open on the person's screen. One dependency-free Node file is the whole runtime, and everything stays on the machine. Use when the user wants to install, run or repair the WPS panel, asks Adelie to read or edit a WPS document, wants the agent's answer written into the open .docx, or asks why the WPS panel is not showing up.
---

# WPS：在 WPS 文字里开一个 Adelie 侧栏

一套东西，两个身份：

- 对**用户**：WPS 功能区多一个「Adelie」按钮，点开是侧栏，能像聊天一样让它读、改当前这篇文档。
- 对**你（Agent）**：同一件事变成九个 `mcp__wps__*` 工具，你直接调就能改那份打开的文档。

桥（`kit/serve.mjs`，零依赖 Node）同时干四件事：托管加载项那页、下发文档指令给面板执行、
替面板跟 Adelie 说话、把加载项登记进 WPS。**它只绑 127.0.0.1，不对网络开端口。**

## Before you start

消息只是点名这个技能（比如「装 WPS 插件」）而没有具体的事，先问清楚三样：**哪台机器**（桥必须和
WPS 同机，因为 WPS 只往本机地址取加载项）、**端口**（默认 3891，撞了才换）、**要不要开机自启**。

还有一件必须先讲明白：**这套东西的加载项只能在 WPS 上跑，当前没有 Windows + WPS 的真机就没法
验收**。你可以把桥跑起来、把加载项登记进去、让 Agent 侧全部验通，但「WPS 里那个按钮长什么样、
点开有没有侧栏」只有用户在 WPS 里亲眼看到才算数。装之前把这句话说清楚，别让用户以为你已经替他看过。

## 结论先行

| 你要的 | 哪一步 | 产物 |
| --- | --- | --- |
| 跑起来 | `node <技能目录>/kit/install.mjs` | 写设置、登记加载项、装 MCP、起桥、留开机自启 |
| 用户能用 | 打开 WPS，点功能区「Adelie」 | 侧栏（面板页由桥托管） |
| 你改文档 | 调 `mcp__wps__*` 工具 | 直接改那份打开的文档 |
| 出问题 | `http://127.0.0.1:3891/status` 与 `wps-bridge/bridge.log` | 桥 / WPS / 面板各自的状态 |
| 不要了 | `node <技能目录>/kit/uninstall.mjs` | 摘掉加载项与 MCP 条目，日志默认留着 |

## 一、装

```bash
node <技能目录>/kit/install.mjs                 # 装（或重装 = 修复）
node <技能目录>/kit/serve.mjs --status          # 只看状态，什么都不改
```

install 做五件事，**每一步都可以重复跑**（重跑就是修复）：写 `config.json`、把加载项交给 WPS
（通过 WPS 自己的本机上架服务 58890，所以**这时 WPS 得开着**）、把桥登记成 Agent 的一个 MCP
服务器并自己连一次自检、在 Windows 的启动文件夹里放一个开机自启的 `.cmd`、把桥拉起来。

参数：`--port`（默认 3891）、`--root`（Adelie 数据根，默认按 `ADELIE_HOME`/`~/.adelie/data` 找）、
`--adelie`（Adelie 的地址，默认自动发现）、`--project` / `--agent`（哪个项目、哪个 Agent 拥有这个
对话，默认第一个项目 + `default_agent`）、`--no-mcp` / `--no-wps` / `--no-autostart` / `--no-start`
（跳过对应的那一步）。

WPS 没开着时第 2 步会跳过并告诉用户怎么办：先打开 WPS，再重跑，或者打开
`http://127.0.0.1:3891/publish` 点一下「安装 / 修复」。

## 二、装完之后，用户看到什么

- WPS 功能区出现「Adelie」组，点一下开/收侧栏。
- 侧栏顶部写着当前文档名与段数；下面是对话，输入框在底下。
- 面板**按文档认会话**：同一份文档打开的是同一个 Adelie 会话，换一份文档就是一个新会话。
- 面板建的会话是 **`read-only` 模式**：读随便读，**改动会弹审批**——用户点「允许」才动文档。
- 回复气泡下面有一粒「写进文档」，把这一轮的回答按段落插到当前光标处。

## 三、你（Agent）怎么改文档

九个工具，段落号**从 1 开始**，指的是最近一次读取时那份文档的段落：

| 工具 | 干什么 | 只读？ |
| --- | --- | --- |
| `mcp__wps__document_summary` | 文档名、路径、段数、当前选区 | 是 |
| `mcp__wps__read_document` | 按段落读正文（`from`/`to`，缺省全文，一次最多 400 段） | 是 |
| `mcp__wps__search_document` | 按文本找段落（大小写不敏感的子串） | 是 |
| `mcp__wps__replace_paragraph` | 替换某一段正文，保留段落样式 | 否 |
| `mcp__wps__insert_paragraph_after` | 在某段之后插一段 | 否 |
| `mcp__wps__delete_paragraph` | 删某一段 | 否 |
| `mcp__wps__insert_break` | 在某段之后插分隔符（`line`/`page`/`section`） | 否 |
| `mcp__wps__create_document` | 新建一篇空白 docx 并切过去 | 否 |
| `mcp__wps__reveal_paragraph` | 把视图滚到某段并选中它 | 是 |

规矩（写进工具描述里了，这里也说一遍）：

1. **动手前先读**：`document_summary` 确认是哪份文档，`read_document` / `search_document` 拿到段号。
2. **改的时候带上 `expect`**：写入当前那段的原文，对不上就拒绝执行并回「段落已变，先重新读取」。
   这是防呆——用户的段号可能已经因为别处的编辑变了。收到了就重新读一遍再改。
3. **改完再读一次确认**，别把「工具没报错」当成「文档改对了」。
4. 写工具都是 `rw`：在 `read-only` 会话里会自动升级成需要用户批准。用户拒绝时不要绕道去改，
   问他要不要换个做法。
5. 段落里不能有换行——`replace_paragraph` 一次只写一段；要写多段就一段一段插。

## 四、出问题按这个顺序看

1. `http://127.0.0.1:3891/status`（人看的页）或 `/status.json`（机器看的）：桥在不在、Adelie 连没连上、
   WPS 上架服务通不通、加载项登记了没、面板连没连。
2. `<数据根>/wps-bridge/bridge.log`：桥每次请求都记一行，包括面板报上来的错误。
3. `node <技能目录>/kit/serve.mjs --status`：命令行版的同一份诊断（不用起服务）。
4. 常见几种：**WPS 里没有 Adelie 那一栏** → 加载项没登记（重跑 install，WPS 要开着）。
   **侧栏说「未连接」** → 桥没跑（重跑 install 的起桥那步）。**说「还没连上 Adelie」** → Adelie
   本体没开。**点发送没反应、工具都报「WPS 里没有打开 Adelie 侧栏」** → WPS 里那个面板页没开。

## 五、卸载

```bash
node <技能目录>/kit/uninstall.mjs            # 摘掉加载项与 MCP 条目，保留设置和日志
node <技能目录>/kit/uninstall.mjs --purge    # 连 <数据根>/wps-bridge/ 一起删
```

它会停用加载项、从 Agent 配置里移除 `wps` 这个 MCP 服务器、删掉开机自启的 `.cmd`。
**正在跑的桥进程不在它的职责里**——那是托管面板页的进程，告诉用户关掉那个最小化的窗口即可。

## 六、红线

- 桥只绑 `127.0.0.1`。**不要**为了让别的机器连上来改成 `0.0.0.0` 或做端口转发——这等于把
  「改用户文档」的能力放到网络上。
- 面板那句「允许」就是用户对自己文档的授权。**不要**替用户批准，也不要把 `approvalMode`
  改成 `allow-all` 图省事。
- 用户的文档不是你的草稿纸：不确定要改哪一段就问，不要靠猜段号去试。
- 这是**用户机器的**安装：装完把 `install.mjs` 打印的那几行（端口、加载项地址、诊断地址）
  原样告诉用户，别只说「装好了」。
