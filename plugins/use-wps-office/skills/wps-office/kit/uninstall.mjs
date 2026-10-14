#!/usr/bin/env node
/**
 * Undo `install.mjs`: take the panel back out of WPS, drop the bridge's MCP entry from the
 * agent's config, and remove the login launcher. Idempotent, and deliberately narrow — it
 * touches only what the installer created:
 *
 *   - the WPS add-on record named `adelie_wps_panel` (disabled, not deleted — WPS keeps its
 *     own list, and disabling is the reversible half of what the installer did);
 *   - the `wps` entry in the agent's `tools.mcpServers`;
 *   - `…\Startup\adelie-wps-bridge.cmd`.
 *
 * Files that hold your settings and history (`<数据根>/wps-bridge/`) are kept: pass `--purge`
 * to delete that directory too. Nothing else on disk is touched.
 *
 *   node uninstall.mjs [--root <数据根>] [--agent <id>] [--no-wps] [--purge]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Adelie,
  DEFAULT_CONFIG,
  MCP_SERVER_NAME,
  bridgeDir,
  readJsonFile,
  resolveDataRoot,
} from "./adelie.mjs";
import { ensureRelay, setAddon } from "./wps.mjs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : undefined;
};

const say = (text = "") => process.stdout.write(`${text}\n`);

async function main() {
  const root = option("root") ?? resolveDataRoot();
  const configFile = path.join(bridgeDir(root), "config.json");
  const config = readJsonFile(configFile, DEFAULT_CONFIG);
  if (option("agent") !== undefined) config.agentId = option("agent");

  say("Adelie 的 WPS 面板 · 卸载");
  say(`   数据根：${root}`);

  if (!flag("no-wps")) {
    say("\n1. 从 WPS 撤下加载项");
    const relay = await ensureRelay({ timeoutMs: 10_000 });
    if (relay === null) {
      say("   – 跳过：WPS 没在运行。关掉就够用了；等下次开着 WPS 时再跑一次本脚本，");
      say("     可以把它从 WPS 的加载项列表里也停掉。");
    } else {
      try {
        await setAddon({ cmd: "disable", url: "" });
        say("   ✓ 已停用（下次启动 WPS 时不再加载这个面板）。");
      } catch (err) {
        say(`   ✗ WPS 拒绝了停用：${err.message}`);
      }
    }
  }

  say("\n2. 从 Agent 配置里拿掉桥的工具");
  const adelie = new Adelie(root, config, () => {});
  const { origin } = await adelie.ensure();
  if (origin === null) {
    say("   – 跳过：Adelie 没在运行。想现在做，就先打开 Adelie 再跑一次。");
  } else {
    try {
      const view = await adelie.agentConfig();
      const servers = Array.isArray(view?.config?.tools?.mcpServers)
        ? view.config.tools.mcpServers
        : [];
      const kept = servers.filter((s) => s?.name !== MCP_SERVER_NAME);
      if (kept.length === servers.length) {
        say(`   ✓ 配置里本来就没有「${MCP_SERVER_NAME}」。`);
      } else {
        await adelie.updateAgentConfig({ tools: { mcpServers: kept } });
        say(`   ✓ 已移除（其余 ${kept.length} 个 MCP 服务器不动）。`);
      }
    } catch (err) {
      say(`   ✗ 没能改 Agent 配置：${err.message}`);
    }
  }

  say("\n3. 取消开机自启");
  const launcher = path.join(
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
    "adelie-wps-bridge.cmd",
  );
  if (fs.existsSync(launcher)) {
    fs.rmSync(launcher);
    say(`   ✓ 已删除 ${launcher}`);
  } else {
    say("   – 没有这个文件（非 Windows，或本来就没建）。");
  }

  say("\n4. 桥自己的日志、设置与文档会话对照表");
  if (flag("purge")) {
    const dir = bridgeDir(root);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      say(`   ✓ 已删除 ${dir}`);
    } else {
      say("   – 本来就没有。");
    }
  } else {
    say(`   – 保留 ${bridgeDir(root)} （设置、日志，以及哪份文档对应哪个会话）。`);
    say("     要一并删掉就加 --purge。");
  }

  say("\n还在跑的桥进程不会自己退出：它是加载项页面的托管方。");
  say("卸载完可以直接关掉那个最小化的窗口（或在任务管理器里结束那个 node 进程）。");
}

await main().catch((err) => {
  process.stderr.write(`\n卸载没有做完：${err?.message ?? err}\n`);
  process.exitCode = 1;
});
