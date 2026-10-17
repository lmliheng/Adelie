# 文档改称 Adelie，并且与代码真正读到的名字对上

- **Date:** 2026-10-17
- **Type:** process
- **Scope:** `docs`

[English](2026-10-17-docs-naming.md)

文档站此前用上游的名字称呼这个产品，路径与变量名也停在这条分支早就不再使用的一套上。现在每一页
都叫 Adelie，页面里写出来的路径、数据根与环境变量，都是这条分支的代码真正读的那一个。

## 改掉的

- 产品名：30 对页面（中英各一份）里的 `PenguinHarness` → `Adelie`，以及文档站自己的标题、`og:`
  标签、描述与侧栏名。
- 桌面端路径：macOS、Windows、Linux 下的日志与数据目录都改成 `Adelie` —— 桌面构建的
  `productName` 就是它；开发态的应用名是 `Adelie-Dev`。
- 数据根与它的变量：`~/.penguin/data` → `~/.adelie/data`，
  `%USERPROFILE%\.penguin\data` → `%USERPROFILE%\.adelie\data`，`PENGUIN_HOME` → `ADELIE_HOME`
  （旧拼写仍被读取，配置参考在要说清的地方写了这一点）。
- 快速开始表格里的安装目录：`~/.penguin` → `~/.adelie`，也就是 `install.sh` 与 `penguin update`
  真正用的默认值。
- 控制面变量：`ADELIE_AGENT_ID`、`ADELIE_SESSION_ID`、`ADELIE_PROJECT_ID`、`ADELIE_API_URL`、
  `ADELIE_API_TOKEN`、`ADELIE_AGENT_KEY`、`ADELIE_ORG_ID`、`ADELIE_LANG`、`ADELIE_PASSWORD`、
  `ADELIE_SHELL`、`ADELIE_UPDATE_CHECK`、`ADELIE_TRUST_PROXY`、`ADELIE_PREVIEW_ORIGIN`、
  `ADELIE_SEED_ADMIN_PASSWORD`、`ADELIE_SERVE_CHILD`、`ADELIE_SUPERVISED`，以及部署接线用的
  `ADELIE_WEB_DIST`、`ADELIE_WEB_DB`、`ADELIE_CLI_ENTRY`、`ADELIE_PORT_FILE`、
  `ADELIE_DESKTOP_TOKEN`。
- 消息格式的宣传名：`Penguin Message` → `Adelie Message`。

## 有意保留旧拼写的地方

安装器与发布协议（`PENGUIN_INSTALL_DIR`、`PENGUIN_VERSION`、`PENGUIN_ARCHIVE`、
`PENGUIN_DOWNLOAD_*`）：正在运行的 CLI 会从某个 Release 下载 `install.sh`，两端只能随发布链一起走，
不跟改名走。上游网关（`PENGUIN_GO_ORIGIN`、`PENGUIN_GO_API_KEY`、`token.penguin.ooo`、
`go.penguin.ooo/modelscope`）：那是他们的服务，值必须与代码发出去的一致。
`PENGUIN_NO_LOGIN_SHELL_ENV` 属于桌面壳。开发态的数据根 `~/.penguin/dev-data`，开发脚本用的就是它。

## 顺带改对的，不是改名

快速开始与 CLI 页面把安装器的下载来源写成了上游的样子：OSS 上的不可变目录、测速探针、
`PENGUIN_DOWNLOAD_SOURCE=auto|oss|github`。Adelie 的安装器从这个仓库的 GitHub Release 下载，只接受
`auto` 与 `github`（在这里两者是一回事），写别的会直接拒绝；要用镜像就设
`PENGUIN_DOWNLOAD_BASE_URL`，另有一个可选的回退地址。页面现在如实这么写。
