---
name: csu-mail
description: Manage a Coremail mailbox (CSU student mail, mail.csu.edu.cn) over IMAP/SMTP with an app password instead of the unified auth portal — create the app password once, then list, search, read and send mail from the shell, with a copy kept in the Sent folder. Use whenever the task involves checking, sending or automating email on a CSU mailbox, or when a CAS login must be avoided.
---

# 中南大学邮箱管理（Coremail，绕开统一身份认证）

## Before you start

如果消息只是点名这个技能（比如「用 csu-mail」）而没有具体的事，先问清楚要做什么——查信、发信，还是
做一次性引导。有具体任务时先自检凭据：`CSU_MAIL_ADDR` / `CSU_MAIL_AUTHCODE` 在不在环境里；不在就去
第一节做引导，那是**起点**不是认证失败，别去重试登录。

## 结论先行

| 事项 | 做法 |
| --- | --- |
| 环境里没有 `CSU_MAIL_ADDR` / `CSU_MAIL_AUTHCODE` | 这是**起点**不是异常：先做一次性引导（**必须登录一次网页邮箱**），见第一节——`bash scripts/bootstrap.sh` 一条命令搞定 |
| 收发信 | **客户端专用密码 + IMAP/SMTP**，不要为了邮件去登录统一身份认证（CAS） |
| 为什么 | 短时间高频登录 CAS 会触发风控、甚至冻结账号（2026-10-02 真实发生过一次） |
| 留底 | 用 SMTP 发信并 `APPEND` 到「已发送」；网页接口 `mbox:compose` **不留底** |

## 一、起点：环境里没有 `CSU_MAIL_ADDR` / `CSU_MAIL_AUTHCODE` 时怎么办

**这两个变量不是前提，是引导的产物。** 全新部署、换机器、或者专用密码丢了，环境里当然什么都没有 ——
这时**必须登录一次网页邮箱**：专用密码只能在登录后的设置页生成，绕不过去。

| 路径 | 需要什么 | 中南大学实测 | 怎么做 |
| --- | --- | --- | --- |
| ① CAS SSO（默认） | 统一身份认证账号 + 密码 | ✅ 可用 | `cas_login.py --mode cas` 换 sid，再驱动设置页生成专用密码。**只做这一次** |
| ② 网页直登 | 邮箱**自己的**密码（≠ 统一密码） | ❌ `FA_UNAUTHORIZED`，还会开始要验证码 | `cas_login.py --mode direct`（POST `/coremail/index.jsp?cus=1`，先把表单隐藏字段原样回传）。只有邮箱有独立密码的部署才走得通 |
| ③ 人工在浏览器里点 | 用户本人（Coremail 二次验证是**短信**，只有真人能收） | ✅ 最稳 | 用户自己登录 → 设置 → 个人信息 → 邮箱密码 → 生成专用密码 → **由用户自己**写进密钥库（别在聊天里贴密码） |

自动化这两步用一条命令：

```bash
cd <插件目录>/skills/csu-mail/scripts
CSU_MAIL_ADDR=学号@csu.edu.cn \
CSU_CAS_USER=学号 CSU_CAS_PASS=密码 \
PROJECT_ID=<App Data Dir 的最后一段> \
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright-core CHROME_PATH=/path/to/chrome \
  bash bootstrap.sh
```

`bootstrap.sh` 做四件事：登录换 sid → 生成专用密码 → 把 `CSU_MAIL_ADDR` / `CSU_MAIL_AUTHCODE`
写进**指定项目**的密钥库 → 销毁临时明文。`NO_VAULT=1` 只打印命令不写库；
`SECRET_OUT=/path` 额外留一份 600 的明文（systemd 这类读不到密钥库的场景要用）。

**账号密码从哪来**：问用户要，或放进密钥库（`CSU_CAS_USER` / `CSU_CAS_PASS`）——
绝不写进代码或仓库；引导完成后这两个变量就该删掉，日常收发信用不到它们。

**键名的别名**（2026-10-05 加）：脚本同时认 `CSU_CAS_ADDRESS`（= 邮箱地址）与 `CSU_CAS_PASSWORD`
（= 统一身份认证密码）这两个名字 —— 密钥库里叫什么就用什么，不必为了对齐插件文档重抄一遍明文。
引导写进密钥库的是插件自己的名字：`CSU_MAIL_ADDR` 与 `CSU_MAIL_AUTHCODE`。

**登录只做一次，失败不要重试**：CAS 短时间高频失败会触发风控甚至冻结账号（2026-10-02 真实发生过一次）。

## 二、系统事实（实测）

| 项 | 值 |
| --- | --- |
| 邮件系统 | Coremail XT5，网页入口 `https://mail.csu.edu.cn` |
| 地址 | `学号@csu.edu.cn`，另有别名 `拼音.csu@csu.edu.cn`，两者是同一邮箱 |
| 二次验证 | 已开启（短信验证），所以第三方客户端只能用**客户端专用密码** |
| IMAP | `imap.csu.edu.cn:993` SSL（`mail.csu.edu.cn:993` 同样可用） |
| POP | `pop.csu.edu.cn:995` SSL |
| SMTP | `smtp.csu.edu.cn:465` SSL；**587 关闭、25 不通** |
| IMAP 证书 | CN = `mail.csu.edu.cn`，与主机名 `imap.csu.edu.cn` 不匹配，必须跳过证书校验，否则 `SSL: CERTIFICATE_VERIFY_FAILED` |

链路实测（2026-10-02，非校园网出口）：

- 两个端口都可达，**TLS1.3** 握手成功；IMAP 问候 `* OK Coremail System IMap Server Ready(...)`，
  SMTP 问候 `220 csu.edu.cn Anti-spam GT for Coremail System (...)`；`imaplib`/`smtplib` 用跳过校验的 `SSLContext` 可直接建连。
- 证书严格校验访问 `imap.csu.edu.cn` 必然 `Hostname mismatch`——这不是网络故障，别再往防火墙方向排查。

认证的边界（都实测过）：

- 统一身份认证密码**不能**登录 IMAP → `LOGIN Login error or password error`
- 网页直登 `/coremail/index.jsp?cus=1`（明文 `uid`+`password`）→ `FA_UNAUTHORIZED`，还会弹验证码
- 结论：第三方客户端只有**客户端专用密码**这一条路

## 三、首次引导：两条路都走完的三步

第一节决定「用哪条路登录」，这里是把结果落到密钥库的三步（`bootstrap.sh` 就是自动化了这三步）。

1. 网页邮箱 → `设置 → 个人信息 → 邮箱密码` →「客户端专用密码」区块 → 点**虚线方框 “+”** → 填密码名称 →「生成」。
   **不需要短信验证**，但密码串**只在生成时显示一次**；丢了就在同一页面「移除」后重建。
2. 后端接口（想自动化时用）：`user:listAppPwds`（列表）、`user:addAppPwd`（创建，响应里带明文）、
   `user:deleteAppPwds`（`{"ids":[102]}`）。请求走 `/coremail/s`，**`func` 与 `sid` 必须在 query string**。
3. 本插件的脚本：

```bash
# ① CAS 登录换 sid（只做一次）
CSU_MAIL_ADDR=学号@csu.edu.cn CSU_CAS_USER=学号 CSU_CAS_PASS=密码 \
  python scripts/cas_login.py --out mail_session.json          # 产出 600 权限的 sid + cookies

# ② 驱动网页邮箱生成专用密码（需要 Playwright）
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright-core \
CHROME_PATH=/path/to/chrome \
  node scripts/create_apppw.mjs mail_session.json agent-server --out secret.txt

# ③ 存进密钥库并删掉明文
#    必须显式带 --project-id / --agent-id：CLI 的默认项目是 default_project，
#    不带就会写进别的项目的密钥库（密钥库里查得到，环境变量里永远没有）。
#    项目 id = 运行环境 App Data Dir 的最后一段，如 /root/.adelie/data/asass -> asass
P="--project-id <项目id> --agent-id default_agent"
penguin config vault set $P --key CSU_MAIL_AUTHCODE --value "$(cat secret.txt)" && shred -u secret.txt
penguin config vault set $P --key CSU_MAIL_ADDR --value "学号@csu.edu.cn"
```

> 写完后**当前会话仍然没有**这两个变量（见踩坑 2）；开一个新对话，或等本会话压缩后再用。

> 引导用的 CAS 登录**不要重试**：失败就停下来问用户，别连续试密码。

## 四、日常收发信：`scripts/mail.py`

```bash
export CSU_MAIL_ADDR=学号@csu.edu.cn CSU_MAIL_AUTHCODE=专用密码   # 或从密钥库注入
V=python3

$V scripts/mail.py check                     # IMAP + SMTP 自检
$V scripts/mail.py list INBOX 10             # 最近 10 封
$V scripts/mail.py list "Sent Items" 5       # 含空格的文件夹要加引号
$V scripts/mail.py read 124                  # 读一封（正文）
$V scripts/mail.py search 成绩                # 按标题检索
$V scripts/mail.py send --to jcc@csu.edu.cn --subject "..." --body-file body.txt
                                             # 发信，并自动存一份到「已发送」
```

依赖：`requests`（只有 `mail.py` 的核心收发用标准库 `imaplib`/`smtplib`/`email`，无需三方包）。

**动手前先自检**：`check` 会依次登录 IMAP 与 SMTP，两条都通过才算通。若报「缺少邮箱地址 / 缺少 CSU_MAIL_AUTHCODE」，
那是凭据没注入，不是认证失败——去查密钥库写没写错项目（见踩坑 9），别去重试登录。

## 五、踩过的坑

1. **「生成」按钮初始是 `disabled`**，弹出框里的密码名称输入框必须用**真实键盘事件**输入
   （Playwright 的 `fill()` 不行，要 `click()` + `keyboard.type()`），否则点了没反应、也不报错。
2. **专用密码只显示一次**：生成后立刻写进密钥库。密钥库变量在**会话开始**时注入，所以当前会话新加的变量当场读不到——
   开一个新对话即可。若**换了会话**还是空的，那不是注入时机问题，是写错了项目（见踩坑 9）。
   验证办法：在当前 shell 里 `echo ${#CSU_MAIL_AUTHCODE}`，非 0 才算注入成功（只输出长度，别打印明文）。
3. **网页接口发信不留底**：`mbox:compose` 返回 `S_OK`，但「已发送」里查不到，事后无法核实送达。
   要留底就用 SMTP 发送 + `IMAP APPEND` 到 `Sent Items`（本插件的 `mail.py send` 就是这么做的）。
4. **文件夹名含空格要加引号**（`"Sent Items"`），否则 IMAP 报 `BAD Request not ending with ...`。
5. **中文 `SEARCH SUBJECT` 命中不稳定**：查不到时改用 `list` 翻页，别下结论说「没有这封邮件」。
6. 网页 API 的 `func` / `sid` 必须放在 **query string**，其余字段放 form body，否则 202/失败。
7. IMAP 证书 CN 不匹配，连接时必须 `check_hostname=False; verify_mode=CERT_NONE`。
8. **不要把账号、密码、专用密码写进代码或提交进仓库**——凭证只放密钥库/环境变量。
9. **`penguin config vault set/list` 的默认项目是 `default_project`**：不带 `--project-id` 就会把凭据写进另一个项目的密钥库，
   现象是「密钥库里查得到，Agent 的 shell 里却始终没有这个变量」。2026-10-02 真实踩到：专用密码落进了 `default_project`，
   而 Agent 跑在别的项目里，于是 `mail.py check` 只报「缺少邮箱地址」——**别把它当认证失败去重试登录**。
   查证方法：`penguin config vault list --project-id <项目id> --agent-id default_agent`，
   项目 id = 运行环境 App Data Dir 的最后一段（`/root/.adelie/data/<项目id>`），列表里有、`env` 里没有就是这个问题。
   修法：把值重新 set 到正确项目，并清掉写错的那份：`penguin config vault remove --key <KEY> --project-id default_project --agent-id <agent>`。

## 六、边界

- 本技能只覆盖**邮件**本身。Coremail 的通讯录、日程不在范围内。
- 代用户发信前先确认收件人与措辞；不要群发、不要发垃圾邮件。
- 邮箱是学校通知与个人信息的入口，读信时注意隐私，不要把邮件内容贴到无关的地方。
