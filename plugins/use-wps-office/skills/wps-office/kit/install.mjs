#!/usr/bin/env node
/**
 * Install Adelie's WPS panel. One run does four things, each idempotent — running it again is
 * also the repair:
 *
 *   1. writes the bridge's settings (`<Adelie 数据根>/wps-bridge/config.json`);
 *   2. tells WPS to load the panel (`http://127.0.0.1:<port>/addin/index.html`) through WPS's
 *      own local relay — this is the step that needs WPS running;
 *   3. registers the bridge's document tools in the agent's config as one MCP server, then
 *      asks Adelie itself to connect to it (`config/mcp-test`) so a broken setup says so here
 *      instead of mid-conversation;
 *   4. starts the bridge now, and on Windows leaves a launcher in the login Startup folder so
 *      it is there again after a reboot.
 *
 * Nothing here needs the network: loopback only, and every port is on this machine.
 *
 *   node install.mjs [--port 3891] [--root <数据根>] [--adelie <origin>] [--project <id>]
 *                    [--agent <id>] [--no-mcp] [--no-wps] [--no-autostart] [--no-start]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Adelie,
  DEFAULT_CONFIG,
  MCP_SERVER_NAME,
  bridgeDir,
  readJsonFile,
  resolveDataRoot,
  writeJsonFile,
} from "./adelie.mjs";
import { addonInstalled, ensureRelay, setAddon } from "./wps.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVE = path.join(HERE, "serve.mjs");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : undefined;
};

const lines = [];
const say = (text = "") => {
  lines.push(text);
  process.stdout.write(`${text}\n`);
};
const step = (n, text) => say(`\n${n}. ${text}`);

async function main() {
  const root = option("root") ?? resolveDataRoot();
  const configFile = path.join(bridgeDir(root), "config.json");
  const config = readJsonFile(configFile, DEFAULT_CONFIG);

  // Flags win over the stored settings; everything else stays as it was.
  if (option("port") !== undefined) config.port = Number(option("port"));
  if (option("adelie") !== undefined) config.adelieUrl = option("adelie");
  if (option("project") !== undefined) config.projectId = option("project");
  if (option("agent") !== undefined) config.agentId = option("agent");
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`端口不合法：${config.port}`);
  }

  // WPS's add-on record holds the add-on *directory*: it fetches manifest.xml, the ribbon and
  // the page from under it. Handing it the page URL instead leaves an add-on that never loads.
  const addinUrl = `http://127.0.0.1:${config.port}/addin/`;
  const panelUrl = `${addinUrl}index.html`;
  const mcpUrl = `http://127.0.0.1:${config.port}/mcp`;

  say("Adelie 的 WPS 面板 · 安装");
  say(`   数据根：${root}`);
  say(`   桥端口：${config.port}`);
  say(`   加载项目录：${addinUrl}`);

  step(1, "写入设置");
  writeJsonFile(configFile, config);
  say(`   ${configFile}`);

  let adelie = null;
  step(2, "连接 Adelie");
  adelie = new Adelie(root, config, () => {});
  const { origin, source } = await adelie.ensure();
  if (origin === null) {
    say("   ✗ 没有找到正在运行的 Adelie。先打开 Adelie 桌面应用，再重跑本脚本。");
  } else {
    say(`   ✓ ${origin}（发现方式：${source}）`);
  }

  let mcpOk = null;
  if (config.installMcp !== false && !flag("no-mcp")) {
    step(3, `把文档工具登记成 MCP 服务器「${MCP_SERVER_NAME}」`);
    if (origin === null) {
      say("   – 跳过：Adelie 没在运行。");
    } else {
      mcpOk = await registerMcp(adelie, mcpUrl);
    }
  }

  if (!flag("no-wps")) {
    step(4, "让 WPS 加载面板");
    const relay = await ensureRelay({ timeoutMs: 15_000 });
    if (relay === null) {
      say("   – 跳过：WPS 的本机上架服务没起来。");
      say("     先把 WPS 打开并保持运行，然后重跑本脚本（或打开下面这个页面点一下「启用」）。");
      say(`     http://127.0.0.1:${config.port}/publish`);
    } else {
      await setAddon({ cmd: "enable", url: addinUrl });
      const installed = await addonInstalled().catch(() => false);
      say(`   ✓ 已交给 WPS（上架服务版本 ${relay}），当前状态：${installed ? "已启用" : "已提交"}`);
    }
  }

  if (!flag("no-autostart")) {
    step(5, "让它开机就在");
    const placed = installAutostart(root);
    say(placed === null ? "   – 只在 Windows 上做这件事，本机不需要。" : `   ✓ ${placed}`);
  }

  if (!flag("no-start")) {
    step(6, "把桥跑起来");
    const running = await isBridgeUp(config.port);
    if (running) {
      say(`   ✓ 已经在跑（${config.port}）。`);
    } else {
      startBridge(root);
      const up = await waitForBridge(config.port);
      say(
        up ? `   ✓ 已启动（${config.port}）。` : `   ✗ 没起来，看看 ${bridgeDir(root)}/bridge.log`,
      );
    }
  }

  say("\n接下来：");
  say("  1. 打开 WPS —— 功能区里应当出现「Adelie」那一组，点开就是侧栏。");
  say("  2. 在侧栏里提问；需要改文档时，该批准的地方会弹出来问你要不要允许。");
  say(`  3. 想先看看面板长什么样，浏览器里打开 ${panelUrl} 。`);
  say(
    `  4. 出问题先看 http://127.0.0.1:${config.port}/status ，那里写着桥、WPS、面板各是什么状态。`,
  );
  say(`\n诊断：node ${path.relative(process.cwd(), SERVE)} --status`);
  if (mcpOk === false) {
    say(
      "\n注意：Adelie 没能连上桥的 MCP 服务（上面有原因）。面板本身照常能用，只是 Agent 摸不到文档。",
    );
  }
}

/** Register (or refresh) the bridge as one MCP server in the agent's config, then test it. */
async function registerMcp(adelie, url) {
  const entry = { name: MCP_SERVER_NAME, config: { transport: "http", url } };
  let view;
  try {
    view = await adelie.agentConfig();
  } catch (err) {
    say(`   ✗ 读不到 Agent 配置：${err.message}`);
    return false;
  }
  // `mcpServers` is a top-level key of the config DTO and of the update body alike: the update
  // endpoint merges only the keys it knows and answers 200 to everything else, so a `tools`
  // wrapper lands nowhere and leaves an install that reported success without registering tools.
  const servers = Array.isArray(view?.config?.mcpServers) ? view.config.mcpServers : [];
  const others = servers.filter((s) => s?.name !== MCP_SERVER_NAME);
  const existing = servers.find((s) => s?.name === MCP_SERVER_NAME);
  const same =
    existing !== undefined && JSON.stringify(existing.config) === JSON.stringify(entry.config);
  if (!same) {
    try {
      await adelie.updateAgentConfig({ mcpServers: [...others, entry] });
      say(
        `   ✓ 已写入 Agent「${adelie.config.agentId}」的配置（原有 ${others.length} 个 MCP 服务器不动）`,
      );
    } catch (err) {
      say(`   ✗ 写配置失败：${err.message}`);
      return false;
    }
  } else {
    say("   ✓ 配置里已经是这一条，不用改。");
  }

  try {
    const probe = await adelie.mcpTest(entry.name, entry.config);
    if (probe?.ok === true) {
      say(`   ✓ Adelie 连上了：${(probe.tools ?? []).length} 个工具，${probe.latencyMs} ms`);
      say(
        `     ${(probe.tools ?? []).slice(0, 3).join("、")}${probe.tools?.length > 3 ? " …" : ""}`,
      );
      return true;
    }
    say(`   ✗ Adelie 连不上这个 MCP 服务器：${probe?.error ?? "未知原因"}`);
    return false;
  } catch (err) {
    say(`   ✗ 自检失败：${err.message}`);
    return false;
  }
}

/**
 * Windows: a launcher in the login Startup folder, so the bridge is running before WPS is
 * opened. It uses the very Node that ran this install — the machine's own interpreter, which
 * is the one thing here we can be sure of.
 */
function installAutostart(root) {
  if (process.platform !== "win32") return null;
  const startup = path.join(
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  );
  if (!fs.existsSync(startup)) return null;
  const file = path.join(startup, "adelie-wps-bridge.cmd");
  const body = [
    "@echo off",
    `rem Adelie 的 WPS 桥：由「Adelie WPS 面板」安装脚本生成，删掉这一行即可取消开机自启。`,
    `start "adelie-wps-bridge" /min "${process.execPath}" "${SERVE}" --root "${root}"`,
    "",
  ].join("\r\n");
  fs.writeFileSync(file, body, "utf8");
  return file;
}

async function isBridgeUp(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status.json`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForBridge(port, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await isBridgeUp(port)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** Start the bridge detached: it must outlive this install command. */
function startBridge(root) {
  const child = spawn(process.execPath, [SERVE, "--root", root], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

await main().catch((err) => {
  process.stderr.write(`\n安装没有做完：${err?.message ?? err}\n`);
  process.exitCode = 1;
});
