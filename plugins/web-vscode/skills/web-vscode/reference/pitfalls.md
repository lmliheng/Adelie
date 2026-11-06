# 坑：症状 → 原因 → 判断

每一条都是真事，按「你先看到什么」查。

## 1. 浏览器直接 `ERR_UNSAFE_PORT`，请求根本没发出去

**原因**：Chrome / Edge 把 6665–6669 列为危险端口（IRC 遗留），6666 正好在里面。
服务端日志一条记录都没有就是证据。

**判断**：`journalctl -k | grep 'UFW BLOCK' | grep DPT=6666` 没有输出，而 `ss -tlnp | grep 6666`
明明在监听——包压根没到。

**处理**：对外端口换到 6766（或任何不在黑名单里的）。这也是反代默认 6766 的原因。

## 2. `Could not register service worker: ... An SSL certificate error occurred when fetching the script`

**原因**：浏览器对**证书无效的源**一律拒绝注册 Service Worker，用户在警告页点
「高级 → 继续前往」只影响页面导航，不影响 SW 注册。而 VS Code 的 webview 和 notebook 都跑在
webview 的 SW 上，所以必然起不来。

**判断**：控制台里搜 `service worker`；`https://<IP>:<port>/ca.crt` 能下、但页面上
`navigator.serviceWorker.controller` 是 `null`。

**处理**：把 `<prefix>/tls/ca.crt` 装进设备的受信任根（iOS 还要单独打开「证书信任设置」）。
装完**退出浏览器进程**重开。别指望换浏览器能绕过——Safari、Firefox 一样拒绝。

## 3. 能用，但 `.ipynb` 打开的是一屏 JSON 文本

**原因**：工作区处于「受限模式」（Restricted Mode），Jupyter 扩展不激活，`.ipynb` 按纯文本
JSON 打开。1.9 MB 的 notebook 在编辑器里滚 JSON，看起来就像卡死。

**判断**：标签页底部有「受限模式」徽标；正文里能看到 `"cell_type": "code"`。

**处理**：`<prefix>/config.yaml` 里加 `disable-workspace-trust: true`，重启。
新版本的 code-server 也认 `--disable-workspace-trust`。装完记得真的开一个 notebook 确认
渲染成单元格，而不是只看到文件树。

## 4. 能登录、文件树正常，但文件点开是空白

**原因**：`crypto.subtle` 不可用——你走的是明文 HTTP，不是安全上下文。

**判断**：控制台报 `'crypto.subtle' is not available so webviews will not work`；
`isSecureContext` 为 `false`。

**处理**：用反代的 HTTPS 端口，不要用 code-server 的明文端口。除非走 SSH 隧道开
`http://localhost:<port>`——localhost 天然是安全上下文。

## 5. 签不了真证书：`Connection reset by peer` / `reader size limit exceeded`

**原因**：机器面对的公网 80 / 443 被云厂商封了（没有备案的国内 IP 很常见）。Let's Encrypt 的
HTTP-01 要从外网连回来的 80 端口，TLS-ALPN-01 要 443，两条都过不去。certbot standalone
也不支持 tls-alpn。

**判断**：`curl http://<IP>/.well-known/acme-challenge/<file>` 从外部节点测是 reset 或超时，
而同一台机器换个高端口（如 6766）从多国节点都在——说明封的是端口，不是机器。
`check-host.net` 的 `check-tcp` / `check-http` 免 key，可以直接从多个国家测。

**处理**：本机 CA + 设备信任，或者让用户给一个能配 DNS 的域名（DNS-01 不需要 80/443）。
nip.io / sslip.io 这类通配解析域名要先确认解析到的是本机 IP，再试一次。

## 6. 用 Cloudflare 快速隧道绕过证书，工作台能开、notebook 永远空白

**原因**：快速隧道（`cloudflared tunnel --url`）证书是真的、零警告，但实测两件事：
冷启动每个请求约 2 秒，而且 **webview 的 iframe 根本不生成**，扩展宿主还常报
`The remote extension host took longer than 60s to send its ready message`。

**判断**：`document.querySelectorAll('iframe')` 里只有 worker 那个，没有
`.../webview/browser/pre/index.html`；`.cell-list-container .cell` 数量恒为 0。

**处理**：别把它当入口，只当「临时看一眼文件树」。要零警告又稳定，只能真证书或本机 CA。

## 7. 装完 `status` 说健康检查失败

**排查顺序**：

1. `systemctl status web-vscode-proxy` —— 进程在不在，`server.js` 里的端口与证书路径对不对；
2. `ss -tlnp | grep <tls-port>` —— 端口有没有被别的进程占了；
3. `journalctl -u web-vscode` —— code-server 有没有起来（口令文件权限、`--config` 路径）；
4. `curl -k https://127.0.0.1:<tls-port>/-/healthz` —— 反代本身活着就会返回 `{"ok":true}`，
   活着但 `login` 502，说明是 code-server 那一段断了。

## 8. 证书明明装了，Chrome 还是报 `NET::ERR_CERT_AUTHORITY_INVALID`

**原因**：装到了「当前用户」而不是「本地计算机」，或者装完没有重启浏览器进程（Chrome 把证书
决定缓存在进程里，标签页刷新不管用）。

**判断**：`chrome://settings/certificates` → 「受信任的根证书颁发机构」里找
`Web VS Code Local CA`。找不到就是没装进去。

**处理**：按 SKILL.md 的步骤重装一次，然后**完全退出 Chrome**（任务管理器里没有 chrome.exe）
再打开。
