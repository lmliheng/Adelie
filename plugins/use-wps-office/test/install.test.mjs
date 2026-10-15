/**
 * Install / uninstall tests: what the installer actually does to the agent's config, to the
 * bridge's settings file, and to the running bridge — checked against a fake Adelie that
 * records every write, so no real Adelie and no real agent is touched.
 *
 * `--no-wps` keeps WPS out of it (the relay only exists on a machine with WPS running); the
 * relay path is covered by the bridge's own `/publish` state test.
 *
 *   node --test plugins/wps-office/test/install.test.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(HERE, "..", "skills", "wps-office", "kit");
const INSTALL = path.join(KIT, "install.mjs");
const UNINSTALL = path.join(KIT, "uninstall.mjs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      try {
        resolve(body === "" ? {} : JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

/**
 * A fake Adelie that keeps the agent config in memory and records every write.
 *
 * The shape is the real DTO's (`packages/server/src/api/types.ts` → `AgentConfigDto`): MCP
 * servers sit at the *top level* of `config`, there is no `tools` wrapper around them, and the
 * update endpoint merges only the keys it knows — a body carrying `tools` is answered with a
 * 200 and dropped on the floor. A kinder fake would hide exactly the mistake this file exists
 * to catch, so the fake has to be as unforgiving as the server.
 */
function fakeAdelie() {
  const state = {
    config: {
      toolsBuiltin: [{ name: "read_file" }],
      mcpServers: [{ name: "other", config: { url: "x" } }],
    },
    writes: [],
    probes: [],
  };
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url, "http://127.0.0.1");
      const json = (body, status = 200) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === "/api/install") return json({ installId: "test" });
      if (url.pathname === "/api/projects") return json({ projects: [{ projectId: "p1" }] });
      if (url.pathname === "/api/projects/p1/agents/default_agent/config") {
        if (req.method === "GET") return json({ config: state.config, agentsMd: "# agent" });
        if (req.method === "PUT") {
          const body = await readJson(req);
          state.writes.push(body);
          const next = body?.config ?? {};
          if (Array.isArray(next.mcpServers)) {
            state.config = { ...state.config, mcpServers: next.mcpServers };
          }
          return json({ config: state.config });
        }
      }
      if (url.pathname.endsWith("/config/mcp-test")) {
        const body = await readJson(req);
        state.probes.push(body);
        return json({ ok: true, tools: ["mcp__wps__read_document"], latencyMs: 3 });
      }
      return json({ error: { message: `no fake route: ${req.method} ${url.pathname}` } }, 404);
    })();
  });
  return { server, state };
}

/** Run one of the kit's CLI scripts to completion. */
function run(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

/** Kill the bridge this test started — matched by the unique temp root in its command line. */
function killBridgesFor(root) {
  // Linux-only: elsewhere nothing is killed, and the temp root goes away with the test anyway.
  let entries = [];
  try {
    entries = fs.readdirSync("/proc");
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf8");
      if (cmdline.includes(root) && cmdline.includes("serve.mjs"))
        process.kill(Number(entry), "SIGTERM");
    } catch {
      // process gone, or not ours to read
    }
  }
}

let root = null;
let api = null;
let bridgePort = null;
let adelieUrl = null;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "wps-install-test-"));
  api = fakeAdelie();
  const adeliePort = await freePort();
  await new Promise((resolve) => api.server.listen(adeliePort, "127.0.0.1", resolve));
  adelieUrl = `http://127.0.0.1:${adeliePort}`;
  bridgePort = await freePort();
});

after(async () => {
  killBridgesFor(root);
  await sleep(200);
  await new Promise((resolve) => api.server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
});

test("安装：把桥登记成一个 MCP 服务器，别的不动，并真的连一次", async () => {
  const { code, out } = await run(INSTALL, [
    "--root",
    root,
    "--port",
    String(bridgePort),
    "--adelie",
    adelieUrl,
    "--no-wps",
    "--no-autostart",
  ]);
  assert.equal(code, 0, out);
  assert.match(out, /已写入 Agent/);
  assert.match(out, /Adelie 连上了/);

  const servers = api.state.config.mcpServers;
  assert.deepEqual(
    servers.map((s) => s.name).sort(),
    ["other", "wps"],
    "原有的 MCP 服务器必须留着",
  );
  const wps = servers.find((s) => s.name === "wps");
  assert.equal(wps.config.transport, "http");
  assert.equal(wps.config.url, `http://127.0.0.1:${bridgePort}/mcp`);
  assert.deepEqual(api.state.probes.at(-1), { name: "wps", config: wps.config });

  const config = JSON.parse(fs.readFileSync(path.join(root, "wps-bridge", "config.json"), "utf8"));
  assert.equal(config.port, bridgePort);
  assert.equal(config.adelieUrl, adelieUrl);
});

test("安装：桥被真的拉起来了，现在就能应答", async () => {
  const res = await fetch(`http://127.0.0.1:${bridgePort}/status.json`);
  assert.equal(res.status, 200);
  const status = await res.json();
  assert.equal(status.mcp.url, `http://127.0.0.1:${bridgePort}/mcp`);
});

test("再装一次：不重复写、不重复登记", async () => {
  const before = api.state.writes.length;
  const { code, out } = await run(INSTALL, [
    "--root",
    root,
    "--port",
    String(bridgePort),
    "--adelie",
    adelieUrl,
    "--no-wps",
    "--no-autostart",
  ]);
  assert.equal(code, 0, out);
  assert.match(out, /已经是这一条/);
  assert.match(out, /已经在跑/);
  assert.equal(api.state.writes.length, before, "第二次安装不该再写配置");
  assert.equal(api.state.config.mcpServers.length, 2);
});

test("卸载：摘掉桥的工具，其余保留", async () => {
  // The entry is seeded here rather than leaned on from the install tests above: this test is
  // about the removal, and a fake that quietly ignores the wrong key must not be able to make
  // it pass by having nothing to remove.
  api.state.config = {
    ...api.state.config,
    mcpServers: [
      ...api.state.config.mcpServers.filter((s) => s.name !== "wps"),
      { name: "wps", config: { transport: "http", url: "http://127.0.0.1:1/mcp" } },
    ],
  };
  const { code, out } = await run(UNINSTALL, ["--root", root, "--adelie", adelieUrl, "--no-wps"]);
  assert.equal(code, 0, out);
  assert.deepEqual(
    api.state.config.mcpServers.map((s) => s.name),
    ["other"],
  );
  assert.ok(fs.existsSync(path.join(root, "wps-bridge", "config.json")), "默认要留着设置和日志");
});

test("卸载 --purge：连设置和日志一起清掉", async () => {
  const { code, out } = await run(UNINSTALL, [
    "--root",
    root,
    "--adelie",
    adelieUrl,
    "--no-wps",
    "--purge",
  ]);
  assert.equal(code, 0, out);
  assert.ok(!fs.existsSync(path.join(root, "wps-bridge")), "--purge 之后不该再留着目录");
});
