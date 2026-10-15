/**
 * The bridge's own tests. They run the real `kit/serve.mjs` as a child process and talk to it
 * over HTTP, with a fake Adelie on one side and a fake WPS panel on the other — which is the
 * only way to check the two things that matter here: a document command actually round-trips
 * through the panel in order, and Adelie's message stream really arrives as the handful of
 * event shapes the panel draws.
 *
 * Nothing here touches the live Adelie (the bridge is pointed at the fake by `--adelie`), and
 * every port is picked free at run time.
 *
 *   node --test plugins/wps-office/test/bridge.test.mjs
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
import { Adelie } from "../skills/wps-office/kit/adelie.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVE = path.join(HERE, "..", "skills", "wps-office", "kit", "serve.mjs");
/** Short enough that the timeout path is testable, long enough that it is never hit by accident. */
const COMMAND_TIMEOUT_MS = 3000;

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

async function waitFor(what, check, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) throw new Error(`等待超时：${what}`);
    await sleep(25);
  }
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
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

/** A stand-in for Adelie's HTTP surface: only the routes the bridge actually calls. */
function fakeAdelie() {
  const streams = new Set();
  const seen = {
    sessions: [],
    tasks: [],
    approvals: [],
    aborts: [],
    rejected: [],
    token: undefined,
  };
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url, "http://127.0.0.1");
      const json = (body, status = 200) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === "/api/install") return json({ installId: "test-install" });
      if (req.method === "GET" && url.pathname !== "/api/install") {
        // Once armed, everything else wants the token Adelie rotates on every restart.
        if (seen.token !== undefined && req.headers.authorization !== `Bearer ${seen.token}`) {
          seen.rejected.push(req.headers.authorization ?? null);
          return json({ error: { message: "Not signed in or the sign-in has expired." } }, 401);
        }
      }
      if (url.pathname === "/api/projects") return json({ projects: [{ projectId: "p1" }] });
      if (req.method === "POST" && /\/sessions$/.test(url.pathname)) {
        const body = await readJson(req);
        seen.sessions.push({ path: url.pathname, body });
        return json({ session: { sessionId: "s1" } });
      }
      if (url.pathname === "/api/sessions/s1/stream") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(": connected\n\n");
        streams.add(res);
        req.on("close", () => streams.delete(res));
        return;
      }
      if (url.pathname === "/api/sessions/s1/messages") {
        return json({
          messages: [
            { type: "model_msg", payload: { type: "text", role: "user", text: "你好" } },
            { type: "model_msg", payload: { type: "text", role: "assistant", text: "在的" } },
            { type: "event_msg", payload: { type: "request_end" } },
          ],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/sessions/s1/tasks") {
        const body = await readJson(req);
        seen.tasks.push(body);
        return json({ queued: false });
      }
      if (req.method === "POST" && url.pathname.startsWith("/api/sessions/s1/approvals/")) {
        const body = await readJson(req);
        seen.approvals.push({ id: url.pathname.split("/").pop(), ...body });
        return json({ ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/sessions/s1/abort") {
        seen.aborts.push(true);
        return json({ ok: true });
      }
      return json({ error: { message: `no fake route: ${req.method} ${url.pathname}` } }, 404);
    })();
  });
  return {
    server,
    seen,
    /** Push one frame down the session stream, exactly as Adelie's SSE would. */
    emit(frame) {
      const payload = `data: ${JSON.stringify(frame)}\n\n`;
      for (const res of streams) res.write(payload);
    },
    connectedStreams: () => streams.size,
  };
}

/** An SSE reader that keeps frames and lets a test wait for a matching one. */
async function sseClient(url) {
  const res = await fetch(url, { headers: { accept: "text/event-stream" } });
  assert.equal(res.status, 200, `${url} 应返回 200`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const frames = [];
  const waiters = new Set();
  let cursor = 0;
  void (async () => {
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let at;
      while ((at = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        // `event:` lines are advisory; only the data payload is read.
        const data = raw
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (data === "") continue;
        try {
          frames.push(JSON.parse(data));
        } catch {
          // keep-alive and comments are not frames
        }
      }
      for (const waiter of [...waiters]) waiter();
    }
  })();
  return {
    frames,
    next(predicate, timeoutMs = 8000) {
      return new Promise((resolve, reject) => {
        const attempt = () => {
          for (let i = cursor; i < frames.length; i += 1) {
            if (predicate(frames[i])) {
              cursor = i + 1;
              clearTimeout(timer);
              waiters.delete(attempt);
              resolve(frames[i]);
              return;
            }
          }
        };
        const timer = setTimeout(() => {
          waiters.delete(attempt);
          reject(new Error(`没有等到期望的帧，已有：${JSON.stringify(frames)}`));
        }, timeoutMs);
        waiters.add(attempt);
        attempt();
      });
    },
    close: () => reader.cancel().catch(() => {}),
  };
}

function mcp(toolName, args = {}) {
  return { name: toolName, args };
}

let bang = null; // bridge client handle
let panel = null; // the fake WPS panel's command stream
let api = null; // fake Adelie
let root = null;
let bridge = null;
let adelieOrigin = null;

/** Call an MCP tool through the bridge and return the JSON-RPC result. */
async function callTool(name, args = {}) {
  const res = await fetch(`${bang.url}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  return (await res.json()).result;
}

/** The text the bridge packed into an MCP tool result. */
const textOf = (result) => result.content.map((c) => c.text).join("\n");

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "wps-bridge-test-"));
  const adeliePort = await freePort();
  const bridgePort = await freePort();

  api = fakeAdelie();
  await new Promise((resolve) => api.server.listen(adeliePort, "127.0.0.1", resolve));
  adelieOrigin = `http://127.0.0.1:${adeliePort}`;

  fs.mkdirSync(path.join(root, "wps-bridge"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "wps-bridge", "config.json"),
    JSON.stringify(
      {
        port: bridgePort,
        adelieUrl: `http://127.0.0.1:${adeliePort}`,
        agentId: "default_agent",
        approvalMode: "read-only",
        commandTimeoutMs: COMMAND_TIMEOUT_MS,
      },
      null,
      2,
    ),
  );

  bridge = spawn(process.execPath, [SERVE, "--root", root], { stdio: ["ignore", "pipe", "pipe"] });
  const log = [];
  bridge.stdout.on("data", (d) => log.push(String(d)));
  bridge.stderr.on("data", (d) => log.push(String(d)));
  bang = { url: `http://127.0.0.1:${bridgePort}` };
  await waitFor("桥开始监听", async () => {
    try {
      const res = await fetch(`${bang.url}/status.json`);
      return res.ok;
    } catch {
      return false;
    }
  });

  panel = await sseClient(`${bang.url}/addin/commands`);
  const hello = await fetch(`${bang.url}/addin/hello`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      doc: { name: "月报.docx", path: "/tmp/月报.docx", paragraphs: 12 },
      version: "test",
    }),
  });
  assert.equal(hello.status, 200);
});

after(async () => {
  await panel?.close();
  bridge?.kill("SIGTERM");
  await new Promise((resolve) => api?.server.close(resolve));
  await sleep(150);
  fs.rmSync(root, { recursive: true, force: true });
});

test("桥把文档操作暴露成 MCP 工具，读工具是只读", async () => {
  const status = await (await fetch(`${bang.url}/status.json`)).json();
  assert.equal(status.ok, true);
  assert.equal(status.mcp.url, `${bang.url}/mcp`);
  assert.ok(status.mcp.tools.includes("read_document"));

  const res = await fetch(`${bang.url}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const { result } = await res.json();
  const byName = new Map(result.tools.map((t) => [t.name, t]));
  assert.equal(byName.get("read_document").annotations.readOnlyHint, true);
  assert.equal(byName.get("search_document").annotations.readOnlyHint, true);
  assert.equal(byName.get("replace_paragraph").annotations.readOnlyHint, false);
  assert.equal(byName.get("delete_paragraph").annotations.readOnlyHint, false);
});

test("面板连上后，读取命令走到面板再带着结果回到 Adelie", async () => {
  const pending = callTool("read_document", { from: 2, to: 3 });
  const command = await panel.next((f) => f.op === "doc.read");
  assert.deepEqual(command.args, { from: 2, to: 3 });

  const paragraphs = [
    { index: 2, text: "第一段正文", style: "正文" },
    { index: 3, text: "第二段正文", style: "正文" },
  ];
  const ack = await fetch(`${bang.url}/addin/result`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: command.id, ok: true, result: { paragraphs } }),
  });
  assert.equal(ack.status, 200);

  const result = await pending;
  assert.ok(!result.isError, textOf(result));
  assert.deepEqual(JSON.parse(textOf(result)), { paragraphs });
});

test("改文档的命令按顺序一条条下发，前一条没回下一条不下", async () => {
  const first = callTool("replace_paragraph", {
    index: 3,
    text: "改后的正文",
    expect: "第二段正文",
  });
  const second = callTool("delete_paragraph", { index: 4, expect: "第三段正文" });

  const a = await panel.next((f) => f.op === "doc.replace");
  await sleep(300);
  // The second command must not have been pushed while the first is unanswered.
  assert.equal(
    panel.frames.filter((f) => f.op === "doc.delete").length,
    0,
    "第一条命令未回应时不该下发第二条",
  );

  await fetch(`${bang.url}/addin/result`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: a.id, ok: true, result: { index: 3, text: "改后的正文" } }),
  });

  const b = await panel.next((f) => f.op === "doc.delete");
  assert.deepEqual(b.args, { index: 4, expect: "第三段正文" });
  await fetch(`${bang.url}/addin/result`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: b.id, ok: true, result: { deleted: 4 } }),
  });

  assert.deepEqual(JSON.parse(textOf(await first)), { index: 3, text: "改后的正文" });
  assert.deepEqual(JSON.parse(textOf(await second)), { deleted: 4 });
});

test("面板报错时，工具结果是错误，而不是假装的成功", async () => {
  const pending = callTool("replace_paragraph", { index: 3, text: "新", expect: "已经过期" });
  const command = await panel.next((f) => f.op === "doc.replace");
  await fetch(`${bang.url}/addin/result`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: command.id,
      ok: false,
      error: "第 3 段和 expect 不一致，先重新读取。",
    }),
  });

  const result = await pending;
  assert.equal(result.isError, true);
  assert.match(textOf(result), /expect/);
});

test("面板不回应时，命令会超时而不是把这一轮卡死", async () => {
  const started = Date.now();
  const result = await callTool("document_summary", {});
  assert.equal(result.isError, true);
  assert.match(textOf(result), /超时/);
  assert.ok(Date.now() - started < COMMAND_TIMEOUT_MS + 2000, "超时应当及时返回");
  await panel.next((f) => f.op === "doc.summary");
});

test("WPS 里没开面板时，工具直接说明原因", async () => {
  await panel.close();
  const result = await callTool("document_summary", {});
  assert.equal(result.isError, true);
  assert.match(textOf(result), /面板/);
  panel = await sseClient(`${bang.url}/addin/commands`);
});

test("对话：文档对应的 Adelie 会话按只读方式建，提问发得出去", async () => {
  const res = await fetch(`${bang.url}/panel/session`, { method: "POST" });
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.sessionId, "s1");
  const created = api.seen.sessions.at(-1);
  assert.match(created.path, /\/agents\/default_agent\/sessions$/);
  assert.equal(created.body.approvalMode, "read-only");

  const asked = await fetch(`${bang.url}/panel/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "把第二段改成新标题" }),
  });
  assert.equal((await asked.json()).ok, true);
  const task = api.seen.tasks.at(-1);
  assert.equal(task.queueIfBusy, true);
  assert.match(task.input[0].text, /把第二段改成新标题/);
  assert.match(task.input[0].text, /月报\.docx/, "提问要带上当前文档是哪一份");
});

test("Adelie 的流被归一化成面板要的几种事件", async () => {
  const events = await sseClient(`${bang.url}/panel/events`);
  await waitFor("桥订阅上 Adelie 的会话流", () => api.connectedStreams() > 0);

  // The first frame tells a freshly connected panel what the turn is doing right now: without
  // it a panel has nothing to correct its own "正在处理…" with, and keeps showing a turn that
  // ended before it ever connected.
  assert.deepEqual(await events.next((e) => e.type === "status"), {
    type: "status",
    running: false,
    queued: 0,
  });

  api.emit({ type: "task_state", state: "running", queued: 0 });
  assert.deepEqual(await events.next((e) => e.type === "status"), {
    type: "status",
    running: true,
    queued: 0,
  });

  // …and a panel that connects in the middle of a turn is told about that one, because the next
  // `task_state` is minutes away and until then the judge of "is it busy" is this frame alone.
  const late = await sseClient(`${bang.url}/panel/events`);
  assert.deepEqual(await late.next((e) => e.type === "status"), {
    type: "status",
    running: true,
    queued: 0,
  });
  await late.close();

  api.emit({
    type: "model_msg",
    payload: { type: "partial_text", event_type: "delta", text: "好的，" },
  });
  assert.equal((await events.next((e) => e.type === "delta")).text, "好的，");

  api.emit({
    type: "approval_request",
    toolCall: {
      payload: {
        tool_call_id: "t1",
        name: "mcp__wps__replace_paragraph",
        arguments: '{"index":2,"text":"新标题"}',
      },
    },
  });
  const approval = await events.next((e) => e.type === "approval");
  assert.equal(approval.toolCallId, "t1");
  assert.match(approval.summary, /index=2/);

  // The complete message wins over the partials, and idle ends the turn with it.
  api.emit({
    type: "model_msg",
    payload: { type: "text", role: "assistant", text: "好的，已改好第二段。" },
  });
  api.emit({ type: "task_state", state: "idle" });
  const done = await events.next((e) => e.type === "done");
  assert.equal(done.text, "好的，已改好第二段。");

  // A tool that failed surfaces as a failed tool, not as silence.
  api.emit({
    type: "model_msg",
    payload: {
      type: "tool_call_output",
      tool_call_id: "t2",
      output: "第 3 段和 expect 不一致",
      stop_reason: "error",
    },
  });
  const failed = await events.next((e) => e.type === "tool" && e.state === "failed");
  assert.match(failed.summary, /不一致/);

  await events.close();
});

test("面板的历史只保留对话正文", async () => {
  const body = await (await fetch(`${bang.url}/panel/history`)).json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.messages, [
    { role: "user", text: "你好" },
    { role: "assistant", text: "在的" },
  ]);
});

test("Adelie 换了令牌：桥会重读令牌、再试一次，失败也说人话", async () => {
  // Adelie writes a fresh token on every start; the bridge must pick up the new one without
  // being restarted, and must not relay Adelie's sign-in wording for a loopback API.
  const client = new Adelie(root, { adelieUrl: adelieOrigin, projectId: null }, () => {});
  api.seen.token = "tok-2";
  const before = api.seen.rejected.length;
  await assert.rejects(() => client.projectId(), /令牌/);
  assert.equal(api.seen.rejected.length - before, 2, "401 之后应当再试一次");

  fs.writeFileSync(path.join(root, "api-token"), "tok-2\n");
  assert.equal(await client.projectId(), "p1", "读到新令牌后应当直接通");

  fs.rmSync(path.join(root, "api-token"));
  api.seen.token = undefined;
});

test("审批决定能回传给 Adelie", async () => {
  const res = await fetch(`${bang.url}/panel/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toolCallId: "t1", decision: "allow" }),
  });
  assert.equal((await res.json()).ok, true);
  assert.deepEqual(api.seen.approvals.at(-1), { id: "t1", decision: "allow" });
});
