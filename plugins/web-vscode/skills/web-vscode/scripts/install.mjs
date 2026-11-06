#!/usr/bin/env node
/**
 * web-vscode —— 把 VS Code 装到服务器上，并给出一个浏览器真正能用的入口。
 *
 *   node install.mjs install     # code-server + HTTPS 反代 + 本地证书机构
 *   node install.mjs status      # 现在是什么状态，链路上哪一段不通
 *   node install.mjs uninstall   # 停服务、删单元；--purge 连文件一起删
 *   node install.mjs ca          # 根证书在哪、指纹是什么
 *
 * 为什么不是一个 `npm i -g code-server` 就完事：
 *   * 明文的 http://<IP>:端口 不是安全上下文，浏览器禁用 crypto.subtle，
 *     VS Code 的 webview 与 notebook 直接报错，文件看起来「打不开」；
 *   * Chrome/Edge 把 6665–6669 列为危险端口，6666 连请求都发不出去（ERR_UNSAFE_PORT）；
 *   * 浏览器对证书无效的源一律拒绝注册 Service Worker，点「继续前往」也救不了 webview，
 *     所以证书必须真的被设备信任。
 * 这个脚本把这三件事一次性处理掉：code-server 只监听回环，反代在另一个端口终结 TLS，
 * 证书由本机自己签的 CA 签发，CA 可以下载后装进设备。
 *
 * 用法与选项见 `node install.mjs help`。
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROXY_TEMPLATE = path.join(HERE, "proxy-server.js");

const SERVICE_CODE = "web-vscode.service";
const SERVICE_PROXY = "web-vscode-proxy.service";

const DEFAULTS = {
  prefix: "/opt/web-vscode",
  port: 6666,
  tlsPort: 6766,
  workspace: null,
};

let step = 0;
const info = (msg) => console.log(`  ${msg}`);
const ok = (msg) => console.log(`✓ ${msg}`);
const warn = (msg) => console.log(`! ${msg}`);
const fail = (msg) => {
  throw new Error(msg);
};

function parseArgv(argv) {
  const opts = { _: [] };
  const alias = { t: "--tls-port", p: "--port" };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (alias[a]) a = alias[a];
    if (a === "--help" || a === "-h") {
      opts.help = true;
      continue;
    }
    if (a.startsWith("--")) {
      const [rawKey, inline] = a.slice(2).split("=");
      const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (inline !== undefined) {
        opts[key] = inline;
      } else if (argv[i + 1] && !argv[i + 1].startsWith("-")) {
        opts[key] = argv[++i];
      } else {
        opts[key] = true;
      }
      continue;
    }
    opts._.push(a);
  }
  return opts;
}

const HELP = `web-vscode —— 浏览器版 VS Code 的安装器

  node install.mjs install [选项]     安装并启动（默认 /opt/web-vscode）
  node install.mjs status             查看服务、端口、证书与健康检查
  node install.mjs uninstall [--purge] 停止并移除服务单元；--purge 连目录一起删
  node install.mjs ca [--export <文件>] 打印根证书路径/指纹，可导出后拷到设备

install 选项
  --prefix <dir>       安装目录（默认 /opt/web-vscode）
  --port <n>           code-server 端口，只监听 127.0.0.1（默认 6666）
  --tls-port <n>       对外 HTTPS 端口（默认 6766；别用 6665–6669，Chrome 会拦）
  --password <str>     登录口令（默认随机生成并写在 config.yaml）
  --ip <addr>          追加证书 SAN，可重复或逗号分隔；默认自动探测本机 IPv4
  --workspace <dir>    code-server 打开的目录（默认当前用户 home）
  --no-systemd         不起 systemd 单元，改成后台进程（无 systemd 或无 root 时用）
  --npm-registry <url> 装 code-server 时使用的 npm 源（国内可用 npmmirror）
  --dry-run            只打印将要做什么
  --force              重新生成证书与配置（已存在的真证书默认保留）
`;

function sh(cmd, args, opts = {}) {
  // stdio: 'ignore' 时 execFileSync 返回 null，所以统一兜一层
  const out = execFileSync(cmd, args, { encoding: "utf8", ...opts });
  return (out ?? "").toString().trim();
}

function trySh(cmd, args, opts = {}) {
  try {
    return sh(cmd, args, opts);
  } catch {
    return null;
  }
}

const which = (bin) => trySh("which", [bin]);
const isRoot = () => typeof process.getuid === "function" && process.getuid() === 0;

function writeFile(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  if (mode) fs.chmodSync(file, mode);
}

function localIPv4() {
  const out = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const e of entries ?? []) {
      if (e.family === "IPv4" && !e.internal) out.push(e.address);
    }
  }
  return out;
}

function certFingerprint(file) {
  const out = trySh("openssl", ["x509", "-in", file, "-noout", "-fingerprint", "-sha256"]);
  return out ? out.split("=")[1] : null;
}

// ---------------------------------------------------------------- certificates

function createCertificates(tlsDir, ips, { force }) {
  fs.mkdirSync(tlsDir, { recursive: true });
  const ca = path.join(tlsDir, "ca.crt");
  const caKey = path.join(tlsDir, "ca.key");
  const cert = path.join(tlsDir, "cert.pem");
  const key = path.join(tlsDir, "key.pem");

  const haveLeaf = fs.existsSync(cert) && fs.existsSync(key);
  if (haveLeaf && !force) {
    if (!fs.existsSync(ca)) fail(`${cert} 存在但缺少 ${ca}：要么补上 CA，要么 --force 重新生成`);
    return { ca, cert, key, generated: false };
  }

  if (!which("openssl")) fail("缺少 openssl：apt-get install -y openssl");

  const san = [...new Set(["127.0.0.1", ...ips])].map((ip) => `IP:${ip}`).concat("DNS:localhost");
  if (!fs.existsSync(ca) || force) {
    sh("openssl", ["genrsa", "-out", caKey, "2048"], { stdio: "ignore" });
    sh(
      "openssl",
      [
        "req",
        "-x509",
        "-new",
        "-nodes",
        "-key",
        caKey,
        "-sha256",
        "-days",
        "3650",
        "-out",
        ca,
        "-subj",
        "/CN=Web VS Code Local CA/O=web-vscode",
        "-addext",
        "basicConstraints=critical,CA:TRUE",
        "-addext",
        "keyUsage=critical,keyCertSign,cRLSign",
      ],
      { stdio: "ignore" },
    );
    fs.chmodSync(caKey, 0o600);
  }

  const csr = path.join(tlsDir, "leaf.csr");
  const ext = path.join(tlsDir, "leaf.ext");
  writeFile(
    ext,
    [
      "basicConstraints=CA:FALSE",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      "extendedKeyUsage=serverAuth",
      `subjectAltName=${san.join(",")}`,
      "",
    ].join("\n"),
  );
  sh(
    "openssl",
    [
      "req",
      "-new",
      "-nodes",
      "-newkey",
      "rsa:2048",
      "-keyout",
      key,
      "-out",
      csr,
      "-subj",
      `/CN=${ips[0] ?? "127.0.0.1"}`,
    ],
    { stdio: "ignore" },
  );
  sh(
    "openssl",
    [
      "x509",
      "-req",
      "-in",
      csr,
      "-CA",
      ca,
      "-CAkey",
      caKey,
      "-CAcreateserial",
      "-days",
      "825",
      "-sha256",
      "-extfile",
      ext,
      "-out",
      cert,
    ],
    { stdio: "ignore" },
  );
  fs.rmSync(csr, { force: true });
  fs.rmSync(ext, { force: true });
  fs.chmodSync(key, 0o600);
  return { ca, cert, key, generated: true };
}

// ---------------------------------------------------------------- install

function unitCodeServer(prefix, port, workspace) {
  const bin = which("code-server") ?? "/usr/local/bin/code-server";
  return `[Unit]
Description=Web VS Code (code-server on 127.0.0.1:${port})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${bin} --config ${path.join(prefix, "config.yaml")} ${workspace}
Restart=always
RestartSec=3
Environment=HOME=${os.homedir()}

[Install]
WantedBy=multi-user.target
`;
}

function unitProxy(prefix, tlsPort) {
  return `[Unit]
Description=Web VS Code HTTPS front door (:${tlsPort} -> 127.0.0.1)
After=network-online.target ${SERVICE_CODE}
Wants=network-online.target

[Service]
Type=simple
ExecStart=${process.execPath} ${path.join(prefix, "proxy", "server.js")}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;
}

function healthCheck(tlsPort, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const probe = () => {
      const req = https.get(
        {
          host: "127.0.0.1",
          port: tlsPort,
          path: "/-/healthz",
          rejectUnauthorized: false,
          timeout: 3000,
        },
        (res) => {
          res.resume();
          if (res.statusCode === 200) return resolve(true);
          retry();
        },
      );
      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
      function retry() {
        if (Date.now() > deadline) return resolve(false);
        setTimeout(probe, 1000);
      }
    };
    probe();
  });
}

async function install(opts) {
  const prefix = path.resolve(opts.prefix || DEFAULTS.prefix);
  const port = Number(opts.port || DEFAULTS.port);
  const tlsPort = Number(opts.tlsPort || DEFAULTS.tlsPort);
  const workspace = path.resolve(opts.workspace || os.homedir());
  const useSystemd = !opts.noSystemd;
  const dry = Boolean(opts.dryRun);
  const force = Boolean(opts.force);

  if (process.platform !== "linux")
    fail(`这个安装器只处理 Linux + systemd；当前是 ${process.platform}`);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`--port 不合法：${opts.port}`);
  if (!Number.isInteger(tlsPort) || tlsPort < 1 || tlsPort > 65535)
    fail(`--tls-port 不合法：${opts.tlsPort}`);
  if (port === tlsPort) fail("--port 与 --tls-port 不能相同");
  if (useSystemd && !isRoot()) fail("起 systemd 单元需要 root；或者加 --no-systemd 用后台进程");
  if (tlsPort >= 6665 && tlsPort <= 6669)
    warn(`${tlsPort} 落在 Chrome 的危险端口段 6665–6669，浏览器会 ERR_UNSAFE_PORT`);

  console.log(`\nweb-vscode 安装到 ${prefix}（code-server :${port} → HTTPS :${tlsPort}）\n`);

  const steps = [];
  const planned = (msg) => (dry ? info(`将执行：${msg}`) : (steps.push(msg), ok(msg)));

  // 1. code-server
  let bin = which("code-server");
  if (bin) {
    ok(`code-server 已安装：${bin}`);
  } else {
    const registry = opts.npmRegistry ? ["--registry", String(opts.npmRegistry)] : [];
    planned(`npm install -g code-server ${registry.join(" ")}`);
    if (!dry) {
      execFileSync("npm", ["install", "-g", "code-server", ...registry], { stdio: "inherit" });
      bin = which("code-server");
      if (!bin) fail("npm 装完仍找不到 code-server，请检查 npm 全局 bin 是否在 PATH 里");
    }
  }

  // 2. 目录 + 配置
  const tlsDir = path.join(prefix, "tls");
  const password = opts.password ? String(opts.password) : randomBytes(9).toString("hex");
  if (!dry) {
    fs.mkdirSync(path.join(prefix, "proxy"), { recursive: true });
    fs.mkdirSync(path.join(prefix, "logs"), { recursive: true });
    fs.mkdirSync(path.join(prefix, "run"), { recursive: true });
    writeFile(
      path.join(prefix, "config.yaml"),
      [
        `bind-addr: 127.0.0.1:${port}`,
        "auth: password",
        `password: ${password}`,
        "cert: false",
        "disable-telemetry: true",
        // 受限模式下 Jupyter 不会激活，.ipynb 只会被当成 JSON 文本打开
        "disable-workspace-trust: true",
        "disable-update-check: true",
        "",
      ].join("\n"),
      0o600,
    );
    ok(`配置写入 ${path.join(prefix, "config.yaml")}（0600）`);
  } else {
    info(`将写入 ${path.join(prefix, "config.yaml")}（口令、只监听 127.0.0.1:${port}）`);
  }

  // 3. 证书
  const ips = (Array.isArray(opts.ip) ? opts.ip : opts.ip ? String(opts.ip).split(",") : [])
    .map((s) => s.trim())
    .filter(Boolean);
  const allIps = [...new Set([...ips, ...localIPv4()])].filter((ip) =>
    /^\d+\.\d+\.\d+\.\d+$/.test(ip),
  );
  let certs = { ca: path.join(tlsDir, "ca.crt"), generated: false };
  if (dry) {
    info(`将生成根 CA + 站点证书，SAN: ${[...new Set(["127.0.0.1", ...allIps])].join(", ")}`);
  } else {
    certs = createCertificates(tlsDir, allIps, { force });
    ok(
      certs.generated
        ? `证书已生成：根 CA ${certs.ca}，站点证书 SAN ${[...new Set(["127.0.0.1", ...allIps])].join(", ")}`
        : `沿用已有证书 ${certs.cert}（--force 可重新生成）`,
    );
  }

  // 4. 反代
  if (dry) {
    info(`将写入 ${path.join(prefix, "proxy", "server.js")}`);
  } else {
    const template = fs.readFileSync(PROXY_TEMPLATE, "utf8");
    writeFile(
      path.join(prefix, "proxy", "server.js"),
      template
        .replaceAll("__LISTEN_PORT__", String(tlsPort))
        .replaceAll("__TARGET_PORT__", String(port))
        .replaceAll("__TLS_DIR__", JSON.stringify(tlsDir)),
      0o644,
    );
    ok(`反代写入 ${path.join(prefix, "proxy", "server.js")}`);
  }

  // 5. 起服务
  if (useSystemd) {
    if (dry) {
      info(`将写入 /etc/systemd/system/${SERVICE_CODE} 与 ${SERVICE_PROXY}，并 enable --now`);
    } else {
      const unitDir = "/etc/systemd/system";
      writeFile(path.join(unitDir, SERVICE_CODE), unitCodeServer(prefix, port, workspace), 0o644);
      writeFile(path.join(unitDir, SERVICE_PROXY), unitProxy(prefix, tlsPort), 0o644);
      sh("systemctl", ["daemon-reload"]);
      sh("systemctl", ["enable", "--now", SERVICE_CODE, SERVICE_PROXY]);
      ok(`systemd 单元已启用：${SERVICE_CODE} ${SERVICE_PROXY}`);
    }
  } else {
    const runner = path.join(prefix, "run");
    const logs = path.join(prefix, "logs");
    if (dry) {
      info(`将在后台启动 code-server 与 node proxy/server.js，日志在 ${logs}`);
    } else {
      const { spawn } = await import("node:child_process");
      const start = (name, cmd, args) => {
        const out = fs.openSync(path.join(logs, `${name}.log`), "a");
        const child = spawn(cmd, args, { detached: true, stdio: ["ignore", out, out] });
        child.unref();
        writeFile(path.join(runner, `${name}.pid`), `${child.pid}\n`);
        return child.pid;
      };
      const pidCode = start("code-server", "code-server", [
        "--config",
        path.join(prefix, "config.yaml"),
        workspace,
      ]);
      await new Promise((r) => setTimeout(r, 1500));
      const pidProxy = start("proxy", process.execPath, [path.join(prefix, "proxy", "server.js")]);
      ok(`后台进程已启动：code-server pid ${pidCode}，proxy pid ${pidProxy}`);
    }
  }

  // 6. 防火墙
  if (!dry && isRoot()) {
    const ufw = trySh("ufw", ["status"]);
    if (ufw && /Status:\s*active/i.test(ufw)) {
      sh("ufw", ["allow", `${tlsPort}/tcp`]);
      ok(`ufw 已放行 ${tlsPort}/tcp`);
    }
  }

  // 7. 自检
  if (!dry) {
    const healthy = await healthCheck(tlsPort);
    if (healthy) {
      ok(`自检通过：https://127.0.0.1:${tlsPort}/-/healthz`);
    } else {
      warn(`反代在 60 秒内没有响应，看日志：journalctl -u ${SERVICE_PROXY}（或 ${prefix}/logs）`);
      process.exitCode = 1;
    }
  }

  const hosts = [...new Set([...allIps, "127.0.0.1"])];
  console.log(`\n完成。\n`);
  for (const h of hosts) console.log(`  地址  https://${h}:${tlsPort}/`);
  console.log(`  口令  ${dry ? "（随机生成）" : password}`);
  console.log(`  根证书 ${path.join(tlsDir, "ca.crt")}`);
  console.log(
    `        下载 https://${hosts[0]}:${tlsPort}/ca.crt（先点一次「继续前往」才下得下来）`,
  );
  console.log(`\n下一步：把根证书装进要访问的设备，否则 webview 与 notebook 一定起不来——`);
  console.log(`  浏览器对证书无效的源一律拒绝注册 Service Worker，点「继续前往」不算数。`);
  console.log(`  装法见 skills/web-vscode/reference/pitfalls.md，或跑 node install.mjs ca。\n`);
}

// ---------------------------------------------------------------- status / ca / uninstall

async function status(opts) {
  const prefix = path.resolve(opts.prefix || DEFAULTS.prefix);
  const configFile = path.join(prefix, "config.yaml");
  const config = fs.existsSync(configFile) ? fs.readFileSync(configFile, "utf8") : "";
  const port = /bind-addr:\s*127\.0\.0\.1:(\d+)/.exec(config)?.[1];
  const tlsPort = (() => {
    const p = path.join(prefix, "proxy", "server.js");
    if (!fs.existsSync(p)) return null;
    return /const LISTEN_PORT = (\d+)/.exec(fs.readFileSync(p, "utf8"))?.[1];
  })();

  console.log(`安装目录 ${fs.existsSync(prefix) ? prefix : "（不存在）"}`);
  if (port) console.log(`code-server 127.0.0.1:${port}`);
  if (tlsPort) console.log(`HTTPS :${tlsPort}`);
  for (const unit of [SERVICE_CODE, SERVICE_PROXY]) {
    const state = trySh("systemctl", ["is-active", unit]) ?? "not-found";
    console.log(`${unit} ${state}`);
  }
  const ca = path.join(prefix, "tls", "ca.crt");
  if (fs.existsSync(ca)) {
    console.log(`根证书 ${ca}`);
    console.log(`指纹 ${certFingerprint(ca)}`);
  }
  if (tlsPort) {
    const healthy = await healthCheck(Number(tlsPort), 4000);
    console.log(`健康检查 ${healthy ? "通过" : "失败"}`);
  }
}

function ca(opts) {
  const prefix = path.resolve(opts.prefix || DEFAULTS.prefix);
  const file = path.join(prefix, "tls", "ca.crt");
  if (!fs.existsSync(file)) fail(`找不到 ${file}`);
  if (opts.export) {
    fs.copyFileSync(file, path.resolve(String(opts.export)));
    ok(`已导出到 ${path.resolve(String(opts.export))}`);
  }
  console.log(`路径 ${file}`);
  console.log(`指纹 ${certFingerprint(file)}`);
  const tlsPort = (() => {
    const p = path.join(prefix, "proxy", "server.js");
    return fs.existsSync(p)
      ? /const LISTEN_PORT = (\d+)/.exec(fs.readFileSync(p, "utf8"))?.[1]
      : null;
  })();
  if (tlsPort) console.log(`下载 https://<本机IP>:${tlsPort}/ca.crt`);
}

function uninstall(opts) {
  const prefix = path.resolve(opts.prefix || DEFAULTS.prefix);
  for (const unit of [SERVICE_PROXY, SERVICE_CODE]) {
    if (trySh("systemctl", ["is-enabled", unit]) !== null) {
      trySh("systemctl", ["disable", "--now", unit]);
      fs.rmSync(`/etc/systemd/system/${unit}`, { force: true });
      ok(`已停止并删除 ${unit}`);
    }
  }
  trySh("systemctl", ["daemon-reload"]);
  const runDir = path.join(prefix, "run");
  if (fs.existsSync(runDir)) {
    for (const f of fs.readdirSync(runDir).filter((f) => f.endsWith(".pid"))) {
      const pid = Number(fs.readFileSync(path.join(runDir, f), "utf8").trim());
      if (pid) {
        try {
          process.kill(pid, "SIGTERM");
          ok(`已结束 pid ${pid}（${f}）`);
        } catch {
          warn(`pid ${pid} 已经不在了`);
        }
      }
    }
  }
  if (opts.purge) {
    fs.rmSync(prefix, { recursive: true, force: true });
    ok(`已删除 ${prefix}`);
  } else {
    info(`文件保留在 ${prefix}，要一起删就加 --purge`);
  }
}

// ---------------------------------------------------------------- main

const opts = parseArgv(process.argv.slice(2));
const command = opts._[0] ?? "help";

try {
  if (opts.help || command === "help") {
    console.log(HELP);
  } else if (command === "install") {
    await install(opts);
  } else if (command === "status") {
    await status(opts);
  } else if (command === "ca") {
    ca(opts);
  } else if (command === "uninstall") {
    uninstall(opts);
  } else {
    console.error(`未知命令 ${command}\n`);
    console.log(HELP);
    process.exit(2);
  }
} catch (e) {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
