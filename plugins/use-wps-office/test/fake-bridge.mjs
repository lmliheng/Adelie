#!/usr/bin/env node
/**
 * 测试用的假桥（契约 §5）—— 只实现面板用到的那几个接口，够 Playwright 冒烟跑通：
 * 静态文件（把 addin 目录当加载项目录发出去）、`/addin/hello|commands|result|log`、
 * `/panel/state|session|ask|approve|abort|history|events`。
 *
 * 它跟 `kit/serve.mjs`（真桥）无关：真桥由主 agent 写，之后会拿这份 spec 跑对照测试。
 * 另外多出几个 `/__test/*` 口子，用于测试把「桥推命令」「桥推流事件」这两件事做出来，
 * 以及读走面板报上来的东西。
 *
 * 用法：`node fake-bridge.mjs`（默认 127.0.0.1:3891）或作为模块
 * `const bridge = await startFakeBridge({ port: 3891 })`。
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ADDIN_DIR = join(HERE, "..", "skills", "wps-office", "kit", "addin");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function initialState() {
  return {
    hellos: [], // 面板报上来的文档概况
    logs: [], // 面板的诊断日志
    results: [], // 面板对命令的回答
    asks: [], // 面板发来的提问
    approvals: [], // 面板对审批的回答
    aborts: 0,
    sessionRequests: 0,
    history: [], // GET /panel/history 给面板的内容
    doc: null, // 最近一次 hello 里的文档概况
    session: null, // GET /panel/state 里的会话
    commandsSent: [], // 桥推给面板的命令
    askResponse: { ok: true, queued: false },
  };
}

export async function startFakeBridge({ port = 3891, host = "127.0.0.1" } = {}) {
  const state = initialState();
  /** 推命令用的 SSE 连接（面板的 /addin/commands）。 */
  const commandClients = new Set();
  /** 推流事件用的 SSE 连接（面板的 /panel/events）。 */
  const eventClients = new Set();
  /** 等面板回答某条命令：id -> {resolve, timer}。 */
  const waiters = new Map();
  let nextId = 1;

  function writeJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(body),
    });
    res.end(body);
  }

  function noContent(res) {
    res.writeHead(204, { "cache-control": "no-store" });
    res.end();
  }

  function readBody(req) {
    return new Promise((resolve) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          resolve({});
        }
      });
    });
  }

  function openSse(res) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    res.write(": adelie fake bridge\n\n");
  }

  function writeSse(res, event, data) {
    const lines = [];
    if (event) lines.push(`event: ${event}`);
    lines.push(`data: ${JSON.stringify(data)}`);
    res.write(`${lines.join("\n")}\n\n`);
  }

  async function serveAddinFile(res, relative) {
    const clean = normalize(relative || "index.html").replace(/^(\.\.[/\\])+/, "");
    const file = join(ADDIN_DIR, clean);
    if (!file.startsWith(ADDIN_DIR)) {
      writeJson(res, 403, { ok: false, error: "越界了" });
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
        "content-length": data.length,
      });
      res.end(data);
    } catch (error) {
      writeJson(res, 404, { ok: false, error: `找不到 ${relative}` });
    }
  }

  const server = createServer((req, res) => {
    void handle(req, res).catch((error) => {
      writeJson(res, 500, { ok: false, error: String(error?.message ?? error) });
    });
  });

  async function handle(req, res) {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    /* ---------- 测试用的口子 ---------- */
    if (pathname === "/__test/state") {
      writeJson(res, 200, state);
      return;
    }
    if (pathname === "/__test/set" && method === "POST") {
      Object.assign(state, await readBody(req));
      writeJson(res, 200, { ok: true });
      return;
    }
    if (pathname === "/__test/command" && method === "POST") {
      const body = await readBody(req);
      try {
        const result = await runCommand(body);
        writeJson(res, 200, result);
      } catch (error) {
        writeJson(res, 200, {
          id: body.id ?? null,
          ok: false,
          error: String(error?.message ?? error),
        });
      }
      return;
    }
    if (pathname === "/__test/push" && method === "POST") {
      pushCommand(await readBody(req));
      writeJson(res, 202, { ok: true });
      return;
    }
    if (pathname === "/__test/event" && method === "POST") {
      const body = await readBody(req);
      pushEvent(body.event ?? null, body.data ?? {});
      writeJson(res, 200, { ok: true, clients: eventClients.size });
      return;
    }

    /* ---------- 面板页与它的资源 ---------- */
    if (pathname === "/favicon.ico") {
      await serveAddinFile(res, "images/icon.svg");
      return;
    }

    /* ---------- 桥的接口（契约 §2） ---------- */
    if (pathname === "/addin/hello" && method === "POST") {
      const body = await readBody(req);
      state.hellos.push(body);
      state.doc = body.doc ?? null;
      writeJson(res, 200, {
        ok: true,
        adelie: { connected: true, origin: `http://${host}:${port}` },
      });
      return;
    }
    if (pathname === "/addin/log" && method === "POST") {
      state.logs.push(await readBody(req));
      noContent(res);
      return;
    }
    if (pathname === "/addin/commands" && method === "GET") {
      openSse(res);
      commandClients.add(res);
      req.on("close", () => commandClients.delete(res));
      return;
    }
    if (pathname === "/addin/result" && method === "POST") {
      const body = await readBody(req);
      state.results.push(body);
      const waiter = waiters.get(body.id);
      if (waiter) {
        clearTimeout(waiter.timer);
        waiters.delete(body.id);
        waiter.resolve(body);
      }
      noContent(res);
      return;
    }

    // 其余的 /addin/* 是加载项自己的文件（index.html、panel.js、images/icon.svg……）
    if (pathname.startsWith("/addin/") && method === "GET") {
      await serveAddinFile(res, pathname.slice("/addin/".length));
      return;
    }

    if (pathname === "/panel/state" && method === "GET") {
      writeJson(res, 200, {
        ok: true,
        adelie: { connected: true, origin: `http://${host}:${port}` },
        session: state.session,
        doc: state.doc,
      });
      return;
    }
    if (pathname === "/panel/session" && method === "POST") {
      state.sessionRequests += 1;
      state.session = {
        sessionId: "session-fake-1",
        projectId: "project-fake-1",
        running: false,
        model: "deepseek-flash",
      };
      writeJson(res, 200, {
        ok: true,
        sessionId: state.session.sessionId,
        projectId: state.session.projectId,
        model: state.session.model,
      });
      return;
    }
    if (pathname === "/panel/ask" && method === "POST") {
      state.asks.push(await readBody(req));
      writeJson(res, 200, state.askResponse);
      return;
    }
    if (pathname === "/panel/approve" && method === "POST") {
      state.approvals.push(await readBody(req));
      writeJson(res, 200, { ok: true });
      return;
    }
    if (pathname === "/panel/abort" && method === "POST") {
      state.aborts += 1;
      writeJson(res, 200, { ok: true });
      return;
    }
    if (pathname === "/panel/history" && method === "GET") {
      writeJson(res, 200, { ok: true, messages: state.history });
      return;
    }
    if (pathname === "/panel/events" && method === "GET") {
      openSse(res);
      eventClients.add(res);
      req.on("close", () => eventClients.delete(res));
      return;
    }

    writeJson(res, 404, { ok: false, error: `假桥没有这个接口：${method} ${pathname}` });
  }

  /* ---------- 测试用的小工具 ---------- */

  function pushCommand(command) {
    const payload = {
      id: command.id ?? `cmd-${nextId++}`,
      op: command.op,
      args: command.args ?? {},
    };
    for (const client of commandClients) writeSse(client, null, payload);
    state.commandsSent.push(payload);
    return payload.id;
  }

  function pushEvent(event, data) {
    for (const client of eventClients) writeSse(client, event, data);
  }

  function awaitResult(id, timeout = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(id);
        reject(new Error(`命令 ${id} 在 ${timeout}ms 内没有收到面板的回答`));
      }, timeout);
      waiters.set(id, { resolve, timer });
    });
  }

  async function waitForCommandClient(timeout = 10_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (commandClients.size > 0) return;
      await sleep(50);
    }
    throw new Error("面板一直没连上命令通道（/addin/commands）");
  }

  async function runCommand({ op, args = {}, id }, timeout = 15_000) {
    await waitForCommandClient();
    const commandId = pushCommand({ id, op, args });
    return await awaitResult(commandId, timeout);
  }

  async function waitFor(predicate, { timeout = 10_000, interval = 50 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (predicate(state)) return state;
      await sleep(interval);
    }
    throw new Error(`等了 ${timeout}ms，条件依然不成立`);
  }

  function reset() {
    Object.assign(state, initialState());
  }

  async function close() {
    for (const client of [...commandClients, ...eventClients]) {
      try {
        client.end();
      } catch (error) {
        // 连接已经断了就算了。
      }
    }
    commandClients.clear();
    eventClients.clear();
    for (const waiter of waiters.values()) clearTimeout(waiter.timer);
    waiters.clear();
    await new Promise((resolve) => server.close(resolve));
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    url: `http://${host}:${port}`,
    port,
    state,
    stateSnapshot: () => JSON.parse(JSON.stringify(state)),
    reset,
    set: (patch) => {
      Object.assign(state, patch);
      return state;
    },
    waitFor,
    waitForCommandClient,
    runCommand,
    pushCommand,
    pushEvent,
    awaitResult,
    close,
    server,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PANEL_PORT ?? 3891);
  const bridge = await startFakeBridge({ port });
  console.log(`假桥在 ${bridge.url}（Ctrl-C 停）`);
}
