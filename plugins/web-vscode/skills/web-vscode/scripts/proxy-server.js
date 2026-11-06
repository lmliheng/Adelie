// <prefix>/proxy/server.js —— 由 @adelie/web-vscode 安装器生成，可自由修改，重装会覆盖。
//
// 一个端口同时承担两件事：
//   * TLS 终结并反代到本机 code-server（含 WebSocket 升级，终端/扩展宿主/文件监听都靠它）；
//   * 明文请求一律 301 跳到 HTTPS —— 明文是「不安全上下文」，浏览器的 crypto.subtle 会被禁用，
//     VS Code 的 webview 与 notebook 直接起不来。
//
// 占位符由安装器替换：__LISTEN_PORT__ __TARGET_PORT__ __TLS_DIR__
const fs = require("node:fs");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const LISTEN_PORT = __LISTEN_PORT__;
const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = __TARGET_PORT__;
const TLS_DIR = __TLS_DIR__;

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

function sendCa(res) {
  fs.readFile(path.join(TLS_DIR, "ca.crt"), (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("ca.crt not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/x-x509-ca-cert",
      "Content-Disposition": 'attachment; filename="web-vscode-ca.crt"',
      "Content-Length": data.length,
    });
    res.end(data);
  });
}

function handleRequest(req, res) {
  const started = Date.now();
  const from = (req.socket.remoteAddress || "").replace("::ffff:", "");
  const url = req.url.split("?")[0];

  res.on("finish", () => {
    const ms = Date.now() - started;
    // 静态资源只在慢或出错时记一行，否则日志会被几百个 chunk 淹没
    const isAsset = url.startsWith("/static/") || url.startsWith("/stable-");
    if (!isAsset || res.statusCode >= 400 || ms > 5000)
      log(`${from} ${req.method} ${url} -> ${res.statusCode} ${ms}ms`);
  });

  // 根证书：证书还没被信任时也要能下载，所以这条路不需要可信任的 TLS
  if (url === "/ca.crt" || url === "/ca.cer") {
    sendCa(res);
    return;
  }
  if (url === "/-/healthz") {
    const body = JSON.stringify({
      ok: true,
      target: `${TARGET_HOST}:${TARGET_PORT}`,
      uptime: process.uptime(),
    });
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
    return;
  }

  const proxyReq = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, "x-forwarded-proto": "https" },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (e) => {
    log(`${from} ${req.method} ${url} 上游错误: ${e.code || e.message}`);
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`bad gateway: code-server(127.0.0.1:${TARGET_PORT}) is not responding\n`);
  });
  req.pipe(proxyReq);
}

// WebSocket 升级：把握手原样转给上游，之后两条流直接对接
function handleUpgrade(req, socket, head) {
  const from = (socket.remoteAddress || "").replace("::ffff:", "");
  log(`${from} ws ${req.url.split("?")[0]}`);
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [k, v] of Object.entries(req.headers)) lines.push(`${k}: ${v}`);
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on("error", (e) => {
    log(`${from} ws 上游错误 ${e.code || e.message}`);
    socket.destroy();
  });
  socket.on("error", () => upstream.destroy());
}

const tlsServer = https.createServer(
  {
    key: fs.readFileSync(path.join(TLS_DIR, "key.pem")),
    cert: fs.readFileSync(path.join(TLS_DIR, "cert.pem")),
  },
  handleRequest,
);
tlsServer.on("upgrade", handleUpgrade);
tlsServer.on("tlsClientError", () => {}); // 扫描器/明文误连不打日志

const plainServer = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/ca.crt" || url === "/ca.cer") {
    sendCa(res);
    return;
  }
  const host = (req.headers.host || "localhost").replace(/:\d+$/, "");
  log(`${req.socket.remoteAddress} plain ${url} -> 301`);
  res.writeHead(301, { Location: `https://${host}:${LISTEN_PORT}${req.url}` });
  res.end(`use https://${host}:${LISTEN_PORT}${req.url}\n`);
});

// 同端口双协议：TLS 握手的第一个字节是 0x16，其余当明文
net
  .createServer((socket) => {
    socket.once("data", (buf) => {
      socket.pause();
      socket.unshift(buf);
      if (buf[0] === 0x16) tlsServer.emit("connection", socket);
      else plainServer.emit("connection", socket);
      process.nextTick(() => socket.resume());
    });
    socket.on("error", () => socket.destroy());
  })
  .listen(LISTEN_PORT, "0.0.0.0", () => {
    log(
      `https://0.0.0.0:${LISTEN_PORT} -> http://${TARGET_HOST}:${TARGET_PORT}（明文 301 跳 HTTPS，WebSocket 直通）`,
    );
  });
