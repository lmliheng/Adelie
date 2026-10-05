#!/usr/bin/env node
/**
 * 需求箱的独立服务器：一个端口上只有这一页和它的接口，没有别的静态文件。
 *
 * 作者的机器上是另一种跑法 —— 把它挂在既有的静态服务上（那边 server.mjs 里一行
 * `handleRequirements(req, res, url)` 挂钩）。插件带这个独立入口，是为了不必为了收几条需求
 * 去动别人已经跑着的服务：想停就停，想换端口就换端口。
 *
 * 用法（先跑 install.mjs 生成目录与配置）：
 *   node serve.mjs                    # 读同目录的 box.config.json，HOST/PORT 走环境变量
 *   HOST=0.0.0.0 PORT=3007 node serve.mjs
 */
import { createServer } from "node:http";
import { handleRequirements, initRequirements } from "./requirements.mjs";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3007);

initRequirements();

const server = createServer((req, res) => {
  const url = req.url ?? "/";

  // 两个前缀（页面 /requirements、接口 /api/requirements）归需求箱；其余的一律不发。
  if (handleRequirements(req, res, url)) return;

  if (url.split("?")[0] === "/healthz") {
    const body = JSON.stringify({ ok: true, service: "requirements-box" });
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": String(Buffer.byteLength(body)),
    });
    res.end(body);
    return;
  }

  // 这里不是静态站：除了那一页，什么都不给，也不列目录。
  res.writeHead(302, { location: "/requirements", "cache-control": "no-store" });
  res.end();
});

server.listen(PORT, HOST, () => {
  const shown = HOST === "0.0.0.0" ? "0.0.0.0" : HOST;
  console.log(`需求箱已就绪：http://${shown}:${PORT}/requirements`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
