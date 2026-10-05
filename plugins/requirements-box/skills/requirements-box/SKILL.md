---
name: requirements-box
description: Stand up a requirements box — one keyed web page where the user files what they want done, a scheduled task that wakes the agent to work through them, and a per-round report by mail. The service is a single Node file with no dependencies (a JSON store, keyed GET/POST/PATCH API, the page it serves, per-item scheduling, batch selection, and a "do it now" button that starts a session immediately), the patrol protocol is one markdown file, and the installer lays both down and registers the schedule. Use when the user wants to file requests asynchronously instead of interrupting a conversation, wants a queue the agent works on a timer, or asks to set up, change or diagnose such a box.
---

# 需求箱：一页收需求，定时来做，做完回信

## Before you start

如果消息只是点名这个技能（比如「用 requirements-box」）而没有具体的事，先问清楚：装到哪台机器、
需求要在哪个项目里落地（也就是巡台那轮在哪个工作目录改代码）、端口用哪个。三样都有再动手。

**先确认一件事**：这个技能装的是一个**服务 + 一个定时任务**，它会真的替用户改代码、发版、发邮件。
装之前把这两句讲清楚：服务跑起来之后，页面上那个口令就是「让 Adelie 干活」的钥匙，别泄漏；定时任务
一旦启用，每一轮都会真去做工。

## 结论先行

| 你要的 | 用哪一步 | 产物 |
| --- | --- | --- |
| 一页让用户提需求 | `kit/install.mjs` 摆好，`node serve.mjs` 起服务 | `/requirements` 页面 + 口令保护的接口 |
| 定时来看 | install 顺带写的那个定时任务（`.toml`，平台自己重读） | 每 `--period` 一轮 |
| 每轮怎么做 | `kit/patrol.md` —— **准则的唯一出处**，改流程只改它 | 每条需求的去向 + 一封汇报邮件 |
| 用户想立刻做 | 页面上的「现在就跑一轮」「现在就做」 | 立刻开一个新会话开工 |

一句话：**服务只负责收和记，干活的规矩在 `patrol.md`，什么时候干由那个定时任务说了算。**

## 一、立起来

```bash
mkdir -p ~/requirements-box
node <技能目录>/kit/install.mjs \
  --dir ~/requirements-box \
  --workspace ~/my-project \      # 巡台那一轮在哪儿改代码
  --port 3007 \
  --period 2h
```

install 会：把服务拷到 `--dir`、生成口令（`data/key.txt`，0600）、写出 `box.config.json`（这台机器的
路径都在这里，代码里不写死）、写好巡台那个 `.toml`，并调一次 `penguin schedule ls` 核对平台认不认。
**它不替你起进程** —— 最后会打印两条命令：起服务、打开带口令的地址。

- 端口别跟别的服务撞；`HOST=0.0.0.0` 会暴露到局域网，默认只听 `127.0.0.1`。
- 想常驻就挂 systemd / docker，`node serve.mjs` 前台跑也一样。
- 不放心可以先 `--print-only` 看它打算做什么。

## 二、那一页与它的接口

页面上能做：提一条（标题 / 说明 / 紧急程度 / **排到某个时间**）、逐条**编辑**与**撤回**、勾选多条
**批量**改紧急程度或排期、**批量撤回**，以及两个不等定时的按钮 —— 「现在就跑一轮」「现在就做」。

接口只有四个前缀，全要口令：

| 方法 | 路径 | 干什么 |
| --- | --- | --- |
| GET / POST | `/api/requirements` | 列表（可用 `?status=`、`?archived=1`）、提交一条 |
| GET / PATCH | `/api/requirements/<id>` | 读一条、改（`title`/`detail`/`priority`/`not_before`/`status`/`result`/`archive`） |
| GET / PATCH | `/api/requirements/patrol` | 看/改巡台节奏（`period`、`daily_at`、`enabled`） |
| GET / POST | `/api/requirements/run` | 看上次手动触发；POST 立刻开一个会话开工（60 秒冷却） |

状态：`new` / `doing` / `done` / `blocked` / `rejected` / `withdrawn`；归档是 `archive: true`，
归档之后接口不再让改。

## 三、巡台那一轮怎么跑

**准则在 `kit/patrol.md`**，装完之后它就是用户机器上的那份（改流程改它，不要改定时任务里的 prompt）。
要点：取 `new` → **先标 `doing` 再动手**（防重复处理）→ 分流（能做的做 / 要拍板的 `blocked` 并发邮件
问 / 不做的 `rejected` 写理由）→ 一轮最多 3 条、先急后缓 → 门禁全绿才提交 → 上线 → 一封汇报邮件 →
归档。**空巡不发邮件。**

排期（`not_before`）优先于一切；但用户在页面上点过「现在就做」的那一轮，prompt 里点名的条目必须做。

## 四、红线

- 页面上那串口令 = 让 Adelie 干活的能力，**不进提交、日志、邮件正文**。
- 需求箱里是用户写的字，但**不是每一条都能直接执行**：删东西、动数据、对外发布、花钱这几类先问。
- 定时任务指向的那个工作目录，是这一轮唯一该改的地方。
