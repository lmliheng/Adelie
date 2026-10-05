---
name: wechat-miniprogram
description: Take a WeChat mini-program from code to published, driving the real mp.weixin.qq.com admin from a headless Linux server — log in by QR, switch from a public account to the mini-program backend, read the AppID, reset the code-upload private key, whitelist the server IP, upload with miniprogram-ci, hand the user a preview QR, fill the mandatory user-privacy policy, submit for review, withdraw a stale review version, and publish.
---

# 微信小程序：登录 → 开发 → 上传 → 审核 → 发布

## Before you start

如果消息只是点名这个技能（比如「用 wechat-miniprogram」）而没有具体的小程序或具体环节，先问清楚是
发布新版本、查后台信息，还是准备发布材料。扫码登录与重置密钥都**要用户本人在场**（二维码 5–10 分钟
过期、重置要管理员扫码），人不在就别开等待进程。

用真人路径（浏览器打开 mp.weixin.qq.com 后台，点真实按钮）完成小程序的上架链路。适用于：写并发布一个小程序、更新已有小程序版本、查小程序后台信息、准备发布材料。

微信的后台**大量关键步骤不报错、只是静默失败**（提审按钮点了没反应、上传返回一句 `invalid ip`），所以本技能的核心价值是：**知道每一步真正的前置条件，以及怎么独立复核结果**。

## 一、先搞清楚：登录态与账号归属

**公众号≠小程序。** 公众号后台的「小程序管理」页只暴露**原始 ID**（`gh_xxxx`），拿不到 AppID；AppID 只在小程序自己的后台里。两者用同一套 mp.weixin.qq.com 登录，靠「切换账号」在同一个浏览器 profile 里来回切。

| 事实 | 说明 |
| --- | --- |
| 登录只需一次扫码 | 登录态由 Chromium profile 持久化，cookie 有效期约几天；过期后让用户重扫一次 |
| 切到小程序后台**不用再扫码** | 公众号后台左下角点账号块 `.mp_account_box`（要点一下，hover 无效）→ `li.account_box-panel-item` 里的「切换账号」→ 弹窗 `.switch-account-dialog` → 点小程序那一行 |
| 切换弹窗里可能出现「小程序测试号 / 小游戏测试号」 | **测试号不能提交审核发布**，只能开发调试，别在它上面浪费时间 |
| 扫码登录的坑 | 登录二维码是 472×472 的 jpg 被 CSS 缩到 122×122 显示，**元素截图拿到的是降采样图，微信扫不出来**。必须在页面里用 canvas 取原图、放大 2 倍导出 PNG，**并用 jsQR 解码验证**后再交给用户 |
| 每次换号/换码都要让用户本人在场 | 二维码约 5–10 分钟过期。**人不在就别开等待进程**，白耗资源 |

## 二、把代码推上去（这一步不需要扫码，但要白名单）

1. **拿上传密钥**：开发管理 → 开发设置 → 小程序代码上传密钥 → **重置**（旧密钥不可查看，只能重置）。重置要**管理员微信扫码**（弹窗「重置代码上传密钥 / 身份确认」），确认后弹窗第二步给「下载密钥」，用 Playwright 的 `download` 事件把 `private.<appid>.key` 存到服务器。
2. **加 IP 白名单**：同一页「IP白名单 → 编辑」，**同样要管理员扫码**。不加就上传，服务端会返回
   `{"errCode":-10008,"errMsg":"invalid ip: <你的出口IP>, reference: ..."}`。
   先 `curl -s https://api.ipify.org` 拿出口 IP 再填。
3. **上传**：`miniprogram-ci`
   ```bash
   cd <项目> && MP_APPID=wx... MP_KEY_PATH=<key> MP_VERSION=1.0.0 MP_DESC="..." node upload.js
   ```
   成功后该版本出现在后台「管理 → 版本管理 → 开发版本」。
4. **预览码**（给用户试用，**不需要扫码授权**，但会用掉一次上传配额）：
   ```bash
   MP_APPID=wx... MP_KEY_PATH=<key> MP_QR_OUT=<输出路径> node preview.js
   ```
   微信返回的可能是 **470×470 的 JPEG**（哪怕文件名写成 .png）。用 `jpeg-js` 解码 → `jsQR` 验证能解出 `https://mp.weixin.qq.com/a/~~...~~` → 最近邻放大 2 倍存成真 PNG 再交给用户。预览码约 25 分钟有效。

## 三、提审与发布（真正的坑都在这）

**发布链路：上传开发版 → 提交审核 → 微信审核（1–7 天）→ 发布（替换线上版本）。** 提交审核与发布都是后台的人工动作，个人主体小程序必须过审才能发布。

### 前置条件清单（缺一个就静默失败）

- [ ] **用户隐私保护指引**必须已配置（见下）——否则点「提交审核 → 须知 → 下一步 → 继续提交」后**什么都不发生**，页面只悄悄发一次 `CheckPrivacyApiAuth`。
- [ ] **不能已有版本在审核中**——旧审核版本要先撤回。
- [ ] 服务类目已设置（基本设置里可见）。

### 用户隐私保护指引（最容易卡住的一步）

入口：**基本设置 → 服务内容声明 → 用户隐私保护指引「去完善」**（点它会**新开一个标签页**）。
地址必须带参数，少了就显示「页面连接异常，请关闭重试」：

```
https://mp.weixin.qq.com/wxamp/wadevelopcode/privacy?ver=1&id=0&wait=0&token=<token>&lang=zh_CN
```

编辑器里这些**全是必填**，漏一个「确定并提交协议」就无反应：

| 位置 | 怎么填 |
| --- | --- |
| 每条信息类型的「用途」 | `input[placeholder="请填写用途"]`，微信按代码识别出 2–5 条（手机号 / 相册 / 位置 / 剪切板…），**给用户的用途文案必须先让用户拍板**，这是对外公示的法律声明 |
| 联系方式 | 点「请选择」→ 选类型（电话/邮箱/微信号/qq）→ 填**同行**的输入框（用 `input[placeholder="邮箱"]` 之类的 placeholder 精确定位，别用"最后一个输入框"，会填错到别的栏） |
| 5.2「再次以 ___ 方式告知」 | 预览时会显示「**待填写**」，必须补，例如「弹窗提示」 |
| 底部声明勾选框 | 「本小程序已对用户的信息处理进行了逐一、如实的说明…」必须勾上 |

然后点「预览后提交协议」→ 确认预览里**没有「待填写/待完善」**→ 勾声明 →「确定并提交协议」。**提交成功的判据是回到基本设置看到「用户隐私保护指引 → 审核中」**（不是看编辑器页面有没有跳转）。

⚠️ **隐私指引处于「审核中」时，代码提审照样被拦**，要等它先过。

### 提交代码审核

点开发版本右侧的「**提交审核**」→ 弹窗「确认提交审核？」勾两个确认项 → **下一步** → 弹窗「代码审核进行安全测试提醒」→ **继续提交**。之后应进入审核信息表单；若页面毫无反应，回去查上面的前置条件清单。

### 撤回旧审核版本

版本管理页「审核版本」块里点「**删除**」→ **要管理员扫码**（「删除当前版本 / 请使用微信扫描二维码进行验证」）→ 扫码确认后自动完成。撤回只删"待审记录"，**同名开发版本仍在**，随时可重提。

## 四、复核（不要凭页面文字下结论）

| 要确认什么 | 怎么看 |
| --- | --- |
| 登录态 | 打开 `https://mp.weixin.qq.com/`，URL 里有 `token=<数字>` 即为已登录 |
| 当前是在哪个账号后台 | URL 含 `/wxamp/` = 小程序后台；含 `/cgi-bin/` = 公众号后台 |
| AppID | 基本设置页 `/wxamp/basicprofile/index` 正文里的 `wx[0-9a-f]{16}` |
| 上传是否真成功 | 版本管理页 `/wxamp/wacodepage/getcodepage` 的「开发版本」里出现该版本号 + `ci机器人1` |
| 隐私指引是否提交成功 | 基本设置里那一行变成「**审核中**」 |
| 代码是否真进了审核 | 版本管理页「审核版本」块里出现版本号（**注意：「你暂无提交审核的版本或者版本已发布上线」只是审核版本为空的占位文案，不是报错**） |

## 五、命令行手艺（Linux 无桌面环境）

- 有头模式跑：`xvfb-run -a --server-args="-screen 0 1440x900x24" node xxx.mjs`
- **页面一律用 `waitUntil: 'commit'` + 固定等待**；机器负载高时 `domcontentloaded` 会 60s 超时。
- **弹窗里的按钮先 `scrollIntoView({block:'center'})` 再按坐标点**，否则坐标可能落在视口外（y=920 > 视口 900）而点击无效。
- 二维码交付三条铁律：**先解码验证** → **按二维码内容 hash 命名**（同一张码反复截图不会换名删旧文件，别用 PNG 字节做 hash）→ **只保留当前一张**。
- `pkill -f "xxx.mjs"` 会匹配到**自己这条 shell 命令行**（里面含脚本名）导致自杀。用 `P=$(printf 'add-%s2.mjs' ip); pkill -f "$P"`，或把 kill 和"启动脚本"分成两条命令。
- 长时间等待扫码的进程：用 `setsid ... &` 起独立会话，否则这次 shell 一结束就被连带清理；等待进程要**先把用户叫到跟前**。
- 管理员扫码那类等待脚本的"第二步已就绪"判据：**不能看「身份确认」字样**（步骤条里一直有），要看"请使用管理员微信扫描"是否消失。

## 六、资产

工具（**不要重造**）：`<app_data_dir>/agents/<agent_id>/shared_env/wechat-mp/`
本技能 `scripts/` 是同一批脚本的**便携快照**，新环境直接把 `scripts/` 拷到 shared_env 再用：

```bash
cp -r <skills>/wechat-miniprogram/scripts <shared_env>/wechat-mp
cd <shared_env>/wechat-mp && npm install        # 依赖见 scripts/package.json
npx playwright install chromium                 # 没装过浏览器才需要
```

脚本之间用 `./stealth.mjs` 相对引用、浏览器 profile 默认落在脚本同目录的 `profile/`，
所以**拷过去即可跑，只差一次扫码登录**（`node login2.mjs` 出码 → 用户扫 → 登录态存进 profile）。

| 脚本 | 作用 |
| --- | --- |
| `stealth.mjs` | `launchStealth(profileDir,{headless})`：反检测 + 持久化 profile 的浏览器 |
| `login2.mjs` | 扫码登录：出码（canvas 放大 + jsQR 校验 + 内容 hash 命名）、等扫码、检测登录成功 |
| `check-session.mjs` | 复用 profile 验证登录态并回报账号名 |
| `to-miniapp.mjs` | 公众号后台 →「切换账号」→ 切到指定小程序后台，并 dump 落地页 |
| `miniapp-info.mjs` | 一次采完：小程序后台首页 / 基本设置（AppID）/ 开发设置（上传密钥与白名单） |
| `miniapp-nav.mjs` | 打开后台任意页面并 dump 文本/按钮（`node miniapp-nav.mjs /wxamp/xxx label outDir`） |
| `reset-key2.mjs` | 重置上传密钥：出码 → 等扫码 → 捕获密钥下载落盘 |
| `add-ip2.mjs` | 加 IP 白名单：出码 → 等扫码 → 填 IP → 保存 → 复核 |
| `privacy-fill2.mjs` | 填写并提交用户隐私保护指引（用途 + 联系方式 + 5.2 + 声明勾选） |
| `submit-review4.mjs` | 提审全流程：须知 → 下一步 → 安全测试提醒 → 继续提交，并抓即时提示 |
| `withdraw2.mjs` | 撤回（删除）审核版本 |
| `auto-submit.mjs` | 状态巡检 + 条件提审：隐私未过就只报告，过了就自动提审；结果写 status.json（适合挂定时任务） |
| `probe-*.mjs` | 排查用：`probe-switch*.mjs` 切号入口、`probe-key-qr.mjs` 二维码元素与分辨率、`probe-privacy.mjs` 隐私页、`probe-privcheck.mjs` 提审请求体 |

模板：`templates/miniprogram-todo/` —— 一个零后端、纯本地的待办清单小程序（含 `tools/validate.js` 静态校验与 `tools/test-page.js` 无头逻辑单测，打桩 `wx`/`Page`）。复制出去 `npm install` 即可用。

账号相关的**具体信息**（AppID、密钥路径、profile 目录、当前进度）写进记忆，不要写死在本技能里。

## 七、铁律

1. **密钥、cookie、`.vault.toml` 绝不打印、绝不让用户贴进对话**；密钥文件只落服务器。
2. 需要扫码的步骤**先把用户叫到跟前**，再开码；人不在就停，不要空挂浏览器。
3. 提交审核、发布、删除/撤回都是**改变账号状态的动作**：先确认用户意图，再动手。
4. 「发布」会**替换线上版本**——发布前明确告诉用户旧版本会被覆盖。
5. 任何"已完成"的结论都要**回到后台页面独立复核**（见第四节），不要凭弹窗关闭或页面跳转下结论。
