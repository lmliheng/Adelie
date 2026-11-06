# 验收：每条命令的合格输出是什么

装完不等于能用。按顺序跑完这四项，前三项在服务器上，第四项必须真的开一个 notebook。

## 1. 反代活着

```bash
curl -sk https://127.0.0.1:6766/-/healthz
```

合格：`{"ok":true,"target":"127.0.0.1:6666","uptime":...}`。
返回 502 说明反代在、code-server 不在；连不上说明反代没起来（看
`journalctl -u web-vscode-proxy`）。

## 2. 证书链真的对（不要 `-k`）

```bash
curl --cacert /opt/web-vscode/tls/ca.crt -o /dev/null -w '%{http_code}\n' https://<公网IP>:6766/login
```

合格：`200`。报 `unable to get local issuer certificate` 说明站点证书不是这张 CA 签的
（`--force` 重装一次）；报 `no alternative certificate subject name matches` 说明 SAN 里没有
这个 IP（安装时 `--ip <addr>` 补上）。

## 3. 页面真的是安全上下文

浏览器控制台，或者无头 Chromium：

```js
isSecureContext;                                   // true
navigator.serviceWorker.controller !== null;       // true（首屏后刷新一次）
(await navigator.serviceWorker.getRegistration())?.active?.state;  // "activated"
```

合格：三条都对。任何一条不对，webview 一定失败，先修这里再看别的。

## 4. notebook 真的渲染成单元格

打开任意 `.ipynb`，合格是**看到单元格**（markdown 渲染、代码块带行号）。

无头 Chromium 的写法（把 CA 导入 NSS，**不要**用 `--ignore-certificate-errors`）：

```bash
apt-get install -y libnss3-tools
certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "web-vscode" -i /opt/web-vscode/tls/ca.crt
```

```js
// 登录 → 等 .monaco-workbench → 双击文件树里的 notebook → 等 30s
document.querySelectorAll('.cell-list-container .cell, .notebook-editor .cell-editor-part').length
```

合格：大于 0（一个 12 单元格的 notebook 应返回 12）。
为 0 时先看 `document.querySelectorAll('iframe')` 里有没有 `webview/browser/pre/index.html`：
没有就是 Service Worker 没注册（回到第 3 项）。

**为什么不能用 `--ignore-certificate-errors` 验收**：它让浏览器接受任何证书，于是
「证书未信任 → SW 被拒」这条真实失败路径被跳过，测出来的成功在用户设备上不成立。

## 别忘了这两个端口

- code-server 的端口**只监听 127.0.0.1**：`ss -tlnp | grep <port>` 应该是 `127.0.0.1:<port>`，
  不是 `0.0.0.0`。如果看到 `0.0.0.0`，说明有人手工启动过 code-server，把它停掉。
- 对外只放行反代端口：`ufw status | grep <tls-port>`。**不要**把 code-server 端口也放行——
  明文入口既不能用 webview，还是唯一的弱口令面。
