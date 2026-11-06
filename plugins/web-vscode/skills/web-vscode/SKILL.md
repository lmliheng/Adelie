---
name: web-vscode
description: Stand up VS Code in the browser on a Linux server and make it actually usable — code-server bound to loopback, an HTTPS reverse proxy with its own certificate authority, the certificate-trust steps for Windows/macOS/iOS/Android, and the three checks that decide the install is done. Use whenever the task is to install, fix or verify a web VS Code (code-server) on a server, or when a browser shows the workbench but files, notebooks or webviews will not open.
---

# 浏览器版 VS Code（code-server + HTTPS 反代 + 本地证书机构）

`npm i -g code-server` 只装上了引擎。真正让人能用起来的是另外三件事，缺一个就会出现
「能登录、能看见文件树，但文件打不开」这种半死状态：

1. **必须是 HTTPS**。明文的 `http://<IP>:端口` 不是安全上下文，浏览器禁用 `crypto.subtle`，
   VS Code 的 webview 与 notebook 起不来。
2. **证书必须真的被设备信任**。浏览器对证书无效的源一律拒绝注册 Service Worker，所以
   在警告页点「继续前往」也没用——webview 照样报 `Could not register service worker`。
3. **端口不能落在 Chrome 的危险段**（6665–6669），否则浏览器连请求都不发，直接
   `ERR_UNSAFE_PORT`。

这个插件把三件事一次做完：code-server 只听回环，反代在另一个端口终结 TLS，站点证书由
本机自签的 CA 签发，CA 可以下载后装进任何设备。

## Before you start

如果消息只是点名这个插件（比如「用 web-vscode」）而没有具体的事，先问清楚要做哪一件：
**装一台新的**、**修一台已经装坏的**、还是**只想知道现在为什么打不开**。有具体目标时先跑
`node scripts/install.mjs status`，它会告诉你安装目录、两个单元的状态、证书指纹和健康检查，
比从头猜快得多。

动手前的三个前提，缺哪个先问用户而不是自己造：

- 这台机器是不是 Linux + systemd，能不能拿到 root（拿不到就只能 `--no-systemd`，而且没有开机自启）；
- 用户从哪台设备访问（Windows / macOS / iPhone / Android），装根证书的步骤完全不同；
- 中间有没有反向代理或防火墙。**公网 80 / 443 被云厂商封掉的机器，签不了 Let's Encrypt**，
  只能用本机 CA 这条路。

## 这套东西由什么组成

| 部分 | 位置 | 说明 |
| --- | --- | --- |
| code-server | `127.0.0.1:6666` | 只监听回环；口令与 `disable-workspace-trust` 在 `<prefix>/config.yaml`（0600） |
| 反代 | `0.0.0.0:6766` | `https.createServer` + 同端口双协议：TLS 终结、WebSocket 直通、明文 301 跳 HTTPS |
| 证书 | `<prefix>/tls/{ca.crt,ca.key,cert.pem,key.pem}` | CA 十年，站点证书 825 天，SAN 是探测到的每个 IPv4 + `127.0.0.1` + `localhost` |
| 服务单元 | `web-vscode.service`、`web-vscode-proxy.service` | 一起 enable，反代 `After=web-vscode.service` |
| 默认前缀 | `/opt/web-vscode` | `--prefix` 可改 |

反代还提供两条固定路径：`/-/healthz`（自检用，返回 JSON）和 `/ca.crt`（根证书下载，
证书还没被信任时也能下）。

## 装

```bash
node scripts/install.mjs install                 # 默认 /opt/web-vscode，6666 → 6766
node scripts/install.mjs install --tls-port 8443 --workspace /srv/code
node scripts/install.mjs install --dry-run       # 只打印将要做什么
```

装完脚本会自己等 `/-/healthz` 通过，并打印地址、口令、根证书路径。`code-server` 不在 PATH 里
时会 `npm install -g code-server`，国内机器加 `--npm-registry https://registry.npmmirror.com`。

想用真证书（有域名、能签 Let's Encrypt）时，不必让脚本管：把证书放到
`<prefix>/tls/cert.pem` 和 `key.pem`，不带 `--force` 重跑一次 install，脚本会沿用已有证书。

## 验（三项都要过）

```bash
# 1) 反代活着
curl -k https://127.0.0.1:6766/-/healthz

# 2) 证书链真的对（不跳过校验）
curl --cacert /opt/web-vscode/tls/ca.crt -o /dev/null -w '%{http_code}\n' https://<IP>:6766/login

# 3) 浏览器里：安全上下文 + Service Worker + 一个 notebook
```

第 3 项在浏览器控制台里跑，三条都成立才算装好：

```js
isSecureContext;                                  // true
navigator.serviceWorker.controller !== null;      // true（首屏之后刷新一次再问）
(await navigator.serviceWorker.getRegistration())?.active?.state;  // "activated"
```

然后打开一个 `.ipynb`：**渲染成单元格**才算过。如果标签页里是一屏 JSON 文本
（`"cell_type": "code"`），是「受限模式」没关——`disable-workspace-trust` 没生效。

没有浏览器可用时，用无头 Chromium 也能验：把 `<prefix>/tls/ca.crt` 导入 NSS
（`certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n web-vscode -i ca.crt`），不带
`--ignore-certificate-errors` 启动，数 `.cell-list-container .cell` 的个数。
**用 `--ignore-certificate-errors` 验出来的成功不算数**：它模拟不了「证书未信任时
Service Worker 被拒」，而这正是要排除的失败。

## 让设备信任证书

先把 `https://<IP>:6766/ca.crt` 下载下来（这一步会先弹警告，点一次「继续前往」，文件能下，
但 webview 仍然不可用——所以才有下一步）。

- **Windows**：双击 `.crt` → 安装证书 → 本地计算机 → 将所有的证书放入下列存储 →
  浏览 → **受信任的根证书颁发机构** → 完成。或者管理员命令行
  `certutil -addstore -f Root web-vscode-ca.crt`。
- **macOS**：双击导入「钥匙串访问」→ 系统钥匙串 → 找到 `Web VS Code Local CA` →
  显示简介 → 信任 → 使用此证书时**始终信任**。
- **iPhone / iPad**：Safari 下载 → 设置 → 已下载描述文件 → 安装；装完**必须**再去
  设置 → 通用 → 关于本机 → 证书信任设置，把开关打开。少这一步等于没装。
- **Android**：设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书。

装完**把浏览器全部退出再打开**（Chrome 会把「证书有问题」的决定缓存到进程退出），
再访问就会是干净的 HTTPS，notebook 直接能开。

## 出事时看哪里

症状 → 原因 → 处理，见 [reference/pitfalls.md](reference/pitfalls.md)。最短版：

- `ERR_UNSAFE_PORT`：端口在 6665–6669，换端口。
- `Could not register service worker ... An SSL certificate error occurred`：证书没被信任。
- 打开 `.ipynb` 满屏 JSON：受限模式，检查 `disable-workspace-trust: true`。
- 能登录但不显示文件：`crypto.subtle` 不可用，你用的是明文 HTTP。

## 卸载

```bash
node scripts/install.mjs uninstall           # 停服务、删单元，文件留着
node scripts/install.mjs uninstall --purge   # 连 /opt/web-vscode 一起删
```

只停「这个安装目录自己的」单元：`web-vscode*.service` 里 ExecStart 指向别的目录的一律跳过并提示，
所以同机另一份安装或手工维护的入口不会被带走；单元名是固定的，装第二份时遇到别人的同名单元会拒绝覆盖
（要覆盖加 `--force`）。

code-server 本体不会被卸（可能还有别的用途），要删自己 `npm rm -g code-server`。

## 参考资料

- [reference/pitfalls.md](reference/pitfalls.md)：每个坑的症状、原因、判断命令。
- [reference/verify.md](reference/verify.md)：验收清单与每种输出的合格判据。
