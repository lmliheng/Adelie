#!/usr/bin/env node
/**
 * Adelie's WPS bridge: one dependency-free Node process that puts an Adelie conversation
 * inside WPS.
 *
 * Why a bridge at all, when Adelie's own server could serve the panel: the panel lives in
 * WPS's embedded browser, and Adelie deliberately enables no CORS (`仅限同源`), so a page on
 * another origin cannot call its API. The bridge is that other origin — and the panel talks
 * only to it, while it talks to Adelie. Everything stays on this machine: the bridge binds
 * 127.0.0.1, Adelie lands on localhost, and no port is exposed to the network.
 *
 * It plays four parts, and nothing else:
 *
 *   1. the panel's host       `GET /addin/*` — the WPS add-on's page and assets, served from
 *                             `kit/addin/`; WPS loads `http://127.0.0.1:<port>/addin/index.html`
 *                             as an online add-on, so one panel serves every document.
 *   2. the agent's hands      `GET /addin/commands` (SSE, bridge -> panel) + `POST /addin/result`
 *                             — document reads and edits executed inside WPS by the panel,
 *                             serialized one at a time, because two writers on one document is a
 *                             bug waiting to happen. `POST /mcp` exposes those same operations as
 *                             MCP tools, so an Adelie session drives the open document; reads
 *                             advertise `readOnlyHint` (permission `r`) and every write does not
 *                             (permission `rw`), which is what puts edits behind Adelie's approval.
 *   3. Adelie's client        `GET /panel/state|history|events`, `POST /panel/session|ask|approve|abort`
 *                             — the conversation for the current document. The panel gets a
 *                             normalized event set (status/delta/thinking/tool/approval/done/error)
 *                             so it never has to understand Adelie's own message protocol, and an
 *                             Adelie protocol change lands here, not in the panel.
 *   4. WPS's install button   `GET /publish` + `POST /publish/enable|disable|refresh` — the add-on
 *                             record, written through WPS's local relay (see wps.mjs).
 *
 * Configuration and state live beside Adelie's data root (`<root>/wps-bridge/`), never in this
 * directory: the plugin's files are replaced wholesale on update.
 */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Adelie,
  DEFAULT_CONFIG,
  bridgeDir,
  readJsonFile,
  readToken,
  resolveDataRoot,
  writeJsonFile,
} from "./adelie.mjs";
import {
  ADDON_NAME,
  addonInstalled,
  ensureRelay,
  listAddons,
  relayReachable,
  setAddon,
} from "./wps.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADDIN_DIR = path.join(HERE, "addin");
const KIT_VERSION = "1.0.0";

/* ------------------------------------------------------------------ paths & config ------ */

/* ------------------------------------------------------------------------- logging ------ */

let logStream = null;

function logTo(root, level, message, data) {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${message}${
    data !== undefined ? ` ${typeof data === "string" ? data : JSON.stringify(data)}` : ""
  }`;
  process.stderr.write(`${line}\n`);
  if (root === null) return;
  try {
    const file = path.join(bridgeDir(root), "bridge.log");
    if (logStream === null) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (size > 2 * 1024 * 1024) fs.renameSync(file, `${file}.1`);
      logStream = fs.createWriteStream(file, { flags: "a" });
    }
    logStream.write(`${line}\n`);
  } catch {
    // A log that cannot be written must never take the bridge down.
  }
}

/* ------------------------------------------------------------- panel command channel ---- */

/**
 * The document-operations channel. The panel is the only executor — it is the one holding
 * WPS's own API — so every call is one command out over SSE and one result back, serialized:
 * document edits must be observed in order, and a second writer interleaving with the first
 * would make both unreadable.
 */
class PanelChannel {
  constructor(log) {
    this.log = log;
    this.clients = new Set();
    this.pending = new Map();
    this.queue = Promise.resolve();
    this.seq = 0;
    this.hello = null;
  }

  get connected() {
    return this.clients.size > 0;
  }

  addClient(res) {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  /** A panel call that never arrives must fail loudly rather than hang the agent's turn. */
  send(op, args, { timeoutMs = 30_000 } = {}) {
    if (!this.connected) {
      return Promise.reject(
        new Error("WPS 里没有打开 Adelie 侧栏。请在 WPS 中打开 Adelie 面板后重试。"),
      );
    }
    const run = () =>
      new Promise((resolve, reject) => {
        const id = `c${++this.seq}`;
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`WPS 面板没有回应「${op}」（等待 ${timeoutMs / 1000} 秒超时）。`));
        }, timeoutMs);
        this.pending.set(id, { resolve, reject, timer });
        this.push({ id, op, args });
      });
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  /** Frames go out as plain SSE data lines; the panel answers with `/addin/result`. */
  push(frame) {
    const payload = `data: ${JSON.stringify(frame)}\n\n`;
    for (const res of this.clients) {
      try {
        res.write(payload);
      } catch {
        this.clients.delete(res);
      }
    }
  }

  settle(id, ok, payload) {
    const entry = this.pending.get(id);
    if (entry === undefined) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (ok) entry.resolve(payload ?? {});
    else entry.reject(new Error(typeof payload === "string" ? payload : "WPS 面板报告了错误"));
  }
}

/* ------------------------------------------------- Adelie stream -> panel events -------- */

/**
 * One turn's translator: Adelie speaks in `OmniMessage`s and `ServerEvent`s, the panel in a
 * handful of shapes it can draw. Keeping the translation here (and not in the panel) means a
 * change to Adelie's protocol is one file's problem, and the panel's UI stays about the
 * document.
 */
class TurnTranslator {
  constructor(emit) {
    this.emit = emit;
    this.text = "";
    this.running = false;
  }

  /** One SSE frame from Adelie's session stream. */
  accept(frame) {
    if (typeof frame !== "object" || frame === null) return;
    const type = frame.type;
    if (type === "task_state") {
      const running = frame.state !== "idle";
      this.emit({ type: "status", running, queued: frame.queued ?? 0 });
      if (running) {
        this.text = "";
        this.running = true;
      } else if (this.running) {
        this.running = false;
        this.emit({ type: "done", text: this.text });
      }
      return;
    }
    if (type === "approval_request") {
      const call = frame.toolCall?.payload ?? {};
      this.emit({
        type: "approval",
        toolCallId: call.tool_call_id,
        name: call.name,
        summary: summarizeArguments(call.arguments),
      });
      return;
    }
    if (type === "resync_required") {
      this.emit({ type: "error", message: "连接中断过，正在重新同步对话。" });
      return;
    }
    if (frame.type !== "model_msg" && frame.type !== "event_msg") return;
    const payload = frame.payload ?? {};
    switch (payload.type) {
      case "partial_text":
        if (payload.event_type === "delta" && payload.text !== "") {
          this.text += payload.text;
          this.emit({ type: "delta", text: payload.text });
        }
        return;
      case "text":
        // The complete message is authoritative — partials can be dropped on reconnect.
        if (payload.role === "assistant" && typeof payload.text === "string") {
          this.text = payload.text;
        }
        return;
      case "partial_thinking":
        if (payload.event_type === "delta" && payload.thinking !== "") {
          this.emit({ type: "thinking", text: payload.thinking });
        }
        return;
      case "partial_tool_call":
        if (payload.event_type === "start") {
          this.emit({
            type: "tool",
            id: payload.tool_call_id,
            name: payload.name,
            summary: "",
            state: "running",
          });
        }
        return;
      case "tool_call":
        this.emit({
          type: "tool",
          id: payload.tool_call_id,
          name: payload.name,
          summary: summarizeArguments(payload.arguments),
          state: "running",
        });
        return;
      case "tool_call_output":
        this.emit({
          type: "tool",
          id: payload.tool_call_id,
          name: "",
          summary: firstLine(payload.output),
          state: payload.stop_reason === "completed" ? "done" : "failed",
        });
        return;
      case "abort":
        this.emit({ type: "error", message: payload.error_message ?? "任务被中断。" });
        return;
      case "approval_decision":
        this.emit({
          type: "tool",
          id: payload.tool_call_id,
          name: "",
          summary: payload.decision === "allow" ? "已允许" : "已拒绝",
          state: "done",
        });
        return;
      case "request_end":
        if (payload.stop_reason === "fatal" || payload.stop_reason === "retryable") {
          this.emit({ type: "error", message: payload.error_message ?? "模型调用失败。" });
        }
        return;
      default:
        return;
    }
  }
}

/** Tool arguments are a JSON string; a human-readable one-liner is what the panel draws. */
function summarizeArguments(args) {
  if (typeof args !== "string" || args.trim() === "") return "";
  try {
    const parsed = JSON.parse(args);
    const parts = [];
    for (const [k, v] of Object.entries(parsed)) {
      const value = typeof v === "string" ? v : JSON.stringify(v);
      parts.push(`${k}=${value.length > 60 ? `${value.slice(0, 60)}…` : value}`);
    }
    return parts.join(" ");
  } catch {
    return args.length > 80 ? `${args.slice(0, 80)}…` : args;
  }
}

function firstLine(text) {
  if (typeof text !== "string") return "";
  const line = text.split("\n").find((l) => l.trim() !== "") ?? "";
  return line.length > 120 ? `${line.slice(0, 120)}…` : line;
}

/* ------------------------------------------------------------------------------ MCP ----- */

/** The document tools an Adelie session can call; each maps onto one panel command. */
const MCP_TOOLS = [
  {
    name: "document_summary",
    op: "doc.summary",
    readOnly: true,
    description:
      "当前在 WPS 里打开的文档的概况：文档名、路径、段落总数、以及选区（若有一段被选中）。改文档前先调它确认目标文档。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    args: () => ({}),
  },
  {
    name: "read_document",
    op: "doc.read",
    readOnly: true,
    description:
      "按段落读取文档正文（段落号从 1 开始，闭区间）。缺省读全文，最多 400 段。返回每段的段落号、正文与段落样式名。",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "integer", description: "起始段落号（含），1 起" },
        to: { type: "integer", description: "结束段落号（含）" },
      },
      additionalProperties: false,
    },
    args: (a) => ({ from: a.from, to: a.to }),
  },
  {
    name: "search_document",
    op: "doc.search",
    readOnly: true,
    description: "在当前文档里按文本查找段落（大小写不敏感的子串匹配），返回命中的段落号与正文。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "要找的文字" },
        limit: { type: "integer", description: "最多返回几条，默认 20" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    args: (a) => ({ query: a.query, limit: a.limit }),
  },
  {
    name: "replace_paragraph",
    op: "doc.replace",
    readOnly: false,
    description:
      "替换某一段的正文，保留该段原有的段落样式。传 expect 时，只有该段当前正文与 expect 完全一致才会替换（防止改错行）；不一致时先重新读取。text 里不能有换行，多段请用 insert_paragraph_after 逐段插入。",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "integer", description: "段落号，1 起" },
        text: { type: "string", description: "新的正文（单段）" },
        expect: { type: "string", description: "替换前该段应有的正文，用于校验" },
      },
      required: ["index", "text"],
      additionalProperties: false,
    },
    args: (a) => ({ index: a.index, text: a.text, expect: a.expect }),
  },
  {
    name: "insert_paragraph_after",
    op: "doc.insertAfter",
    readOnly: false,
    description: "在某一段之后插入一个新段落（沿用前一段的样式），返回新段落的段落号。",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "integer", description: "参照段落的段落号，1 起" },
        text: { type: "string", description: "新段落的正文" },
      },
      required: ["index", "text"],
      additionalProperties: false,
    },
    args: (a) => ({ index: a.index, text: a.text }),
  },
  {
    name: "delete_paragraph",
    op: "doc.delete",
    readOnly: false,
    description: "删除某一段。传 expect 时先校验该段正文，不一致则拒绝删除。",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "integer", description: "段落号，1 起" },
        expect: { type: "string", description: "删除前该段应有的正文" },
      },
      required: ["index"],
      additionalProperties: false,
    },
    args: (a) => ({ index: a.index, expect: a.expect }),
  },
  {
    name: "insert_break",
    op: "doc.break",
    readOnly: false,
    description: "在某一段之后插入分隔符：分页 / 分节 / 换行。",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "integer", description: "段落号，1 起" },
        kind: { type: "string", enum: ["line", "page", "section"], description: "分隔符种类" },
      },
      required: ["index", "kind"],
      additionalProperties: false,
    },
    args: (a) => ({ index: a.index, kind: a.kind }),
  },
  {
    name: "create_document",
    op: "doc.create",
    readOnly: false,
    description: "新建并打开一个空白 docx 文档；之后所有读写都针对这个新文档。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    args: () => ({}),
  },
  {
    name: "reveal_paragraph",
    op: "doc.reveal",
    readOnly: true,
    description: "把视图滚到某一段并选中它，让用户看见改动落在了哪里。",
    inputSchema: {
      type: "object",
      properties: { index: { type: "integer", description: "段落号，1 起" } },
      required: ["index"],
      additionalProperties: false,
    },
    args: (a) => ({ index: a.index }),
  },
];

/* ---------------------------------------------------------------------------- server ---- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

async function readBody(req, capBytes = 512 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > capBytes) throw new Error("请求体过大");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("请求体不是合法 JSON");
  }
}

function startEventStream(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(": adelie-wps bridge\n\n");
  return res;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => argv.includes(`--${name}`);
  const option = (name) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : undefined;
  };

  const root = option("root") ?? resolveDataRoot();
  const configFile = path.join(bridgeDir(root), "config.json");
  const stateFile = path.join(bridgeDir(root), "state.json");
  const config = readJsonFile(configFile, DEFAULT_CONFIG);
  if (option("port") !== undefined) config.port = Number(option("port"));
  if (option("adelie") !== undefined) config.adelieUrl = option("adelie");
  if (option("project") !== undefined) config.projectId = option("project");

  const adelie = new Adelie(root, config, (m, d) => logTo(root, "info", m, d));
  const panel = new PanelChannel((m, d) => logTo(root, "info", m, d));
  const state = readJsonFile(stateFile, { sessions: {} });
  const panelEventClients = new Set();
  const translator = new TurnTranslator((event) => {
    for (const res of panelEventClients) {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        panelEventClients.delete(res);
      }
    }
  });

  /**
   * What WPS is told to load, and what a person can open in a browser. WPS's add-on record
   * holds a *directory* — it fetches `manifest.xml`, the ribbon and the page from under it —
   * which is how WPS's own publish page registers an online add-on (`…/jsplugindir/`).
   */
  const addinBase = `http://127.0.0.1:${config.port}/addin/`;
  /** The panel page itself: what the ribbon opens as a task pane, and what you open to look. */
  const addinUrl = `${addinBase}index.html`;

  const sessionFor = (docKey) => state.sessions?.[docKey] ?? null;
  const rememberSession = (docKey, value) => {
    state.sessions = { ...(state.sessions ?? {}), [docKey]: { ...value, atMs: Date.now() } };
    writeJsonFile(stateFile, state);
  };

  /* ------------------------------------------------------------------ Adelie stream ---- */

  let streamAbort = null;
  let streamSessionId = null;

  /** One long-lived subscription per session, reconnecting; events fan out to the panel. */
  function subscribe(sessionId) {
    if (streamSessionId === sessionId && streamAbort !== null) return;
    streamAbort?.abort();
    streamSessionId = sessionId;
    const controller = new AbortController();
    streamAbort = controller;
    void (async () => {
      let backoff = 1000;
      while (!controller.signal.aborted) {
        try {
          const res = await adelie.fetch(`/api/sessions/${encodeURIComponent(sessionId)}/stream`, {
            headers: { accept: "text/event-stream" },
            signal: controller.signal,
          });
          if (!res.ok || res.body === null) throw new Error(`HTTP ${res.status}`);
          backoff = 1000;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let at;
            while ((at = buffer.indexOf("\n\n")) >= 0) {
              const frame = buffer.slice(0, at);
              buffer = buffer.slice(at + 2);
              const data = frame
                .split("\n")
                .filter((l) => l.startsWith("data:"))
                .map((l) => l.slice(5).trimStart())
                .join("\n");
              if (data === "" || data === "{}") continue;
              try {
                translator.accept(JSON.parse(data));
              } catch {
                // An unreadable frame is not worth dropping the subscription for.
              }
            }
          }
        } catch (err) {
          if (controller.signal.aborted) return;
          logTo(root, "warn", "adelie stream dropped", String(err));
        }
        if (controller.signal.aborted) return;
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 10_000);
      }
    })();
  }

  /* ------------------------------------------------------------------- HTTP routes ----- */

  const server = http.createServer((req, res) => {
    void handle(req, res).catch((err) => {
      logTo(root, "error", `${req.method} ${req.url} failed`, String(err?.message ?? err));
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: String(err?.message ?? err) });
      else res.end();
    });
  });

  async function handle(req, res) {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${config.port}`);
    const route = `${req.method} ${url.pathname}`;

    /* --- the panel's command channel ---------------------------------------------------- */
    if (route === "POST /addin/hello") {
      const body = await readBody(req);
      panel.hello = { ...body, atMs: Date.now() };
      const { origin } = await adelie.ensure();
      logTo(root, "info", "panel connected", { doc: body?.doc?.name ?? null, adelie: origin });
      return sendJson(res, 200, {
        ok: true,
        adelie: { connected: origin !== null, origin },
        panel: { document: body?.doc ?? null },
      });
    }
    if (route === "GET /addin/commands") {
      const stream = startEventStream(res);
      panel.addClient(stream);
      const timer = setInterval(() => {
        try {
          stream.write("event: ping\ndata: {}\n\n");
        } catch {
          clearInterval(timer);
        }
      }, 20_000);
      req.on("close", () => clearInterval(timer));
      return;
    }
    if (route === "POST /addin/result") {
      const body = await readBody(req);
      panel.settle(body.id, body.ok === true, body.ok === true ? body.result : body.error);
      return sendJson(res, 200, { ok: true });
    }
    if (route === "POST /addin/log") {
      const body = await readBody(req);
      logTo(
        root,
        body.level === "error" ? "error" : body.level === "warn" ? "warn" : "info",
        `panel: ${body.message ?? ""}`,
        body.data,
      );
      return sendJson(res, 200, { ok: true });
    }

    /* --- the add-on's own files --------------------------------------------------------- */
    // Everything under /addin/ that is not one of the endpoints above is a file of the panel
    // itself. This block comes after them on purpose: as a prefix match it would otherwise
    // swallow /addin/commands and answer 404 for a page the panel needs.
    if (req.method === "GET" && url.pathname.startsWith("/addin/")) {
      const rel = url.pathname.slice("/addin/".length) || "index.html";
      const file = path.join(ADDIN_DIR, rel);
      if (!file.startsWith(ADDIN_DIR)) return sendText(res, 403, "forbidden");
      try {
        const body = await fsp.readFile(file);
        res.writeHead(200, {
          "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
          "cache-control": "no-store",
          "content-length": body.length,
        });
        return res.end(body);
      } catch {
        return sendText(res, 404, `no such add-in file: ${rel}`);
      }
    }

    /* --- the panel's conversation ------------------------------------------------------- */
    if (route === "GET /panel/state") {
      const { origin } = await adelie.ensure();
      const doc = panel.hello?.doc ?? null;
      const key = docKeyOf(doc);
      const known = key === null ? null : sessionFor(key);
      return sendJson(res, 200, {
        ok: true,
        adelie: { connected: origin !== null, origin: adelie.origin },
        panel: { connected: panel.connected, document: doc },
        session: known,
        bridge: { version: KIT_VERSION, port: config.port },
      });
    }
    if (route === "POST /panel/session") {
      const doc = panel.hello?.doc ?? null;
      const key = docKeyOf(doc);
      if (key === null) return sendJson(res, 400, { ok: false, error: "还没有打开文档。" });
      const existing = sessionFor(key);
      if (existing !== null) {
        subscribe(existing.sessionId);
        return sendJson(res, 200, { ok: true, ...existing });
      }
      const workspace = doc?.path ? path.dirname(doc.path) : undefined;
      const created = await adelie.createSession({ workspace });
      const value = { ...created, document: doc?.path ?? doc?.name ?? "未命名" };
      rememberSession(key, value);
      subscribe(value.sessionId);
      return sendJson(res, 200, { ok: true, ...value });
    }
    if (route === "GET /panel/history") {
      const doc = panel.hello?.doc ?? null;
      const key = docKeyOf(doc);
      const known = key === null ? null : sessionFor(key);
      if (known === null) return sendJson(res, 200, { ok: true, messages: [] });
      const limit = Number(url.searchParams.get("limit") ?? 60);
      const body = await adelie.messages(known.sessionId, limit);
      const messages = [];
      for (const message of body?.messages ?? []) {
        const payload = message?.payload ?? {};
        if (message?.type !== "model_msg" || payload.type !== "text") continue;
        if (payload.role !== "user" && payload.role !== "assistant") continue;
        if (payload.sender !== undefined) continue;
        const text = String(payload.text ?? "").trim();
        if (text === "") continue;
        messages.push({ role: payload.role, text });
      }
      return sendJson(res, 200, { ok: true, messages });
    }
    if (route === "POST /panel/ask") {
      const body = await readBody(req);
      const text = String(body.text ?? "").trim();
      if (text === "") return sendJson(res, 400, { ok: false, error: "消息是空的。" });
      const doc = panel.hello?.doc ?? null;
      const key = docKeyOf(doc);
      if (key === null) return sendJson(res, 400, { ok: false, error: "还没有打开文档。" });
      let known = sessionFor(key);
      if (known === null) {
        const created = await adelie.createSession({
          workspace: doc?.path ? path.dirname(doc.path) : undefined,
        });
        known = { ...created, document: doc?.path ?? doc?.name ?? "未命名" };
        rememberSession(key, known);
      }
      subscribe(known.sessionId);
      const prompt = withDocumentContext(text, doc, body);
      try {
        const sent = await adelie.task(known.sessionId, prompt);
        return sendJson(res, 200, { ok: true, queued: sent?.queued === true });
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: String(err?.message ?? err) });
      }
    }
    if (route === "POST /panel/approve") {
      const body = await readBody(req);
      const doc = panel.hello?.doc ?? null;
      const known = docKeyOf(doc) === null ? null : sessionFor(docKeyOf(doc));
      if (known === null) return sendJson(res, 400, { ok: false, error: "没有会话。" });
      await adelie.approve(
        known.sessionId,
        String(body.toolCallId ?? ""),
        body.decision === "deny" ? "deny" : "allow",
      );
      return sendJson(res, 200, { ok: true });
    }
    if (route === "POST /panel/abort") {
      const doc = panel.hello?.doc ?? null;
      const known = docKeyOf(doc) === null ? null : sessionFor(docKeyOf(doc));
      if (known === null) return sendJson(res, 400, { ok: false, error: "没有会话。" });
      await adelie.abort(known.sessionId);
      return sendJson(res, 200, { ok: true });
    }
    if (route === "GET /panel/events") {
      const stream = startEventStream(res);
      panelEventClients.add(stream);
      // A panel that opens (or reopens) after the turn started hears no `task_state` until the
      // next one — and a panel whose first frame never says "not running" waits forever with
      // "正在处理…" for a turn that already finished. Say where the turn stands, right now.
      try {
        stream.write(
          `data: ${JSON.stringify({ type: "status", running: translator.running, queued: 0 })}\n\n`,
        );
      } catch {
        panelEventClients.delete(stream);
      }
      const timer = setInterval(() => {
        try {
          stream.write("event: ping\ndata: {}\n\n");
        } catch {
          clearInterval(timer);
        }
      }, 20_000);
      req.on("close", () => {
        clearInterval(timer);
        panelEventClients.delete(stream);
      });
      return;
    }

    /* --- the agent's document tools (MCP) ----------------------------------------------- */
    if (url.pathname === "/mcp") {
      if (req.method === "GET") {
        res.writeHead(405, { allow: "POST", "content-type": "application/json" });
        return res.end("{}");
      }
      if (req.method === "DELETE") {
        res.writeHead(204);
        return res.end();
      }
      if (req.method !== "POST") return sendText(res, 405, "method not allowed");
      const body = await readBody(req);
      const reply = await mcpReply(body);
      if (reply === null) {
        res.writeHead(202, { "content-type": "application/json" });
        return res.end();
      }
      return sendJson(res, 200, reply);
    }

    /* --- installing the add-on into WPS -------------------------------------------------- */
    if (route === "GET /publish") {
      return sendText(
        res,
        200,
        publishPage(config, addinBase, addinUrl),
        "text/html; charset=utf-8",
      );
    }
    if (route === "GET /publish/state") {
      const reachable = await relayReachable();
      let addons = [];
      let error = null;
      if (reachable) {
        try {
          addons = await listAddons();
        } catch (err) {
          error = String(err?.message ?? err);
        }
      }
      return sendJson(res, 200, {
        ok: true,
        relay: reachable,
        installed: await addonInstalled().catch(() => false),
        addons,
        error,
        addinUrl: addinBase,
        panelUrl: addinUrl,
      });
    }
    if (route === "POST /publish/enable" || route === "POST /publish/disable") {
      const enable = url.pathname.endsWith("enable");
      const version = await ensureRelay({ timeoutMs: 20_000 });
      if (version === null) {
        return sendJson(res, 200, {
          ok: false,
          error: "WPS 的本机上架服务没起来。请先打开 WPS（并保持它运行），再点一次。",
        });
      }
      try {
        await setAddon({ cmd: enable ? "enable" : "disable", url: enable ? addinBase : "" });
        logTo(root, "info", `add-on ${enable ? "enabled" : "disabled"} via WPS relay`, addinBase);
        return sendJson(res, 200, { ok: true, installed: await addonInstalled() });
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: String(err?.message ?? err) });
      }
    }

    /* --- diagnostics --------------------------------------------------------------------- */
    if (route === "GET /status" || route === "GET /status.json") {
      const { origin, source } = await adelie.ensure();
      const report = {
        bridge: { version: KIT_VERSION, port: config.port, root, dataRoot: root },
        adelie: {
          origin,
          source,
          token: readToken(root) !== null,
        },
        wps: {
          relay: await relayReachable(),
          addonInstalled: await addonInstalled().catch(() => false),
          addonUrl: addinBase,
        },
        panel: { connected: panel.connected, document: panel.hello?.doc ?? null },
        mcp: { tools: MCP_TOOLS.map((t) => t.name), url: `http://127.0.0.1:${config.port}/mcp` },
        state: state.sessions ?? {},
      };
      if (url.pathname.endsWith(".json")) return sendJson(res, 200, { ok: true, ...report });
      return sendText(res, 200, statusPage(report), "text/html; charset=utf-8");
    }
    if (route === "GET /") {
      res.writeHead(302, { location: "/status" });
      return res.end();
    }
    return sendJson(res, 404, { ok: false, error: `no route: ${route}` });
  }

  /** One MCP request in, one JSON-RPC response out — or null for a notification. */
  async function mcpReply(body) {
    const id = body?.id ?? null;
    const method = body?.method;
    const ok = (result) => ({ jsonrpc: "2.0", id, result });
    const fail = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
    if (method === undefined) return fail(-32600, "invalid request");
    if (method.startsWith("notifications/")) return null;
    if (method === "initialize") {
      return ok({
        protocolVersion: body.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "adelie-wps", version: KIT_VERSION },
        instructions:
          "这些工具操作 WPS 里当前打开的文档。段落号从 1 开始，来自最近一次读取；改动前先读取或搜索定位，改完再读一次确认。",
      });
    }
    if (method === "ping") return ok({});
    if (method === "tools/list") {
      return ok({
        tools: MCP_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { readOnlyHint: tool.readOnly, openWorldHint: false },
        })),
      });
    }
    if (method === "tools/call") {
      const name = body.params?.name;
      const tool = MCP_TOOLS.find((t) => t.name === name);
      if (tool === undefined) return fail(-32602, `unknown tool: ${String(name)}`);
      const args = body.params?.arguments ?? {};
      try {
        const result = await panel.send(tool.op, tool.args(args), {
          timeoutMs: config.commandTimeoutMs,
        });
        return ok({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (err) {
        return ok({
          content: [{ type: "text", text: String(err?.message ?? err) }],
          isError: true,
        });
      }
    }
    return fail(-32601, `unsupported method: ${method}`);
  }

  /* --- diagnostics from the command line, for install / repair / the skill --------------- */
  if (flag("status")) {
    const { origin, source } = await adelie.ensure();
    const report = {
      port: config.port,
      addinUrl: addinBase,
      panelUrl: addinUrl,
      dataRoot: root,
      adelie: { origin, source, token: readToken(root) !== null },
      wps: { relay: await relayReachable(), installed: await addonInstalled().catch(() => false) },
      mcpUrl: `http://127.0.0.1:${config.port}/mcp`,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  if (flag("print-url")) {
    process.stdout.write(`${addinBase}\n`);
    return;
  }

  await new Promise((resolve, reject) => {
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `端口 ${config.port} 已被占用。若 Adelie 的 WPS 桥已在运行，这没关系；否则请用 --port 换一个端口并重新安装加载项。`,
          ),
        );
      } else {
        reject(err);
      }
    });
    server.listen(config.port, config.host, () => {
      logTo(root, "info", `adelie wps bridge listening on http://${config.host}:${config.port}`);
      logTo(root, "info", `add-on directory: ${addinBase} (page: ${addinUrl})`);
      logTo(root, "info", `mcp endpoint: http://127.0.0.1:${config.port}/mcp`);
      resolve();
    });
  });

  const shutdown = () => {
    logTo(root, "info", "bridge stopping");
    streamAbort?.abort();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/** A document's identity for session reuse: its full path, or its name when unsaved. */
function docKeyOf(doc) {
  if (doc === null || doc === undefined) return null;
  const key =
    doc.path && String(doc.path).trim() !== "" ? String(doc.path) : `untitled:${doc.name ?? ""}`;
  return key.trim() === "" || key === "untitled:" ? null : key;
}

/**
 * What the agent is told about the document, ahead of the person's question. The panel sends
 * the context choice (selection / whole document / none); the text itself is read through the
 * same command channel, so the agent gets what the person can actually see right now.
 */
function withDocumentContext(text, doc, body) {
  const context = body.context ?? "selection";
  if (context === "none") return text;
  // The document is always named: an agent that answers about "this document" without knowing
  // which one it is will guess, and the person cannot see the guess.
  const name = doc?.name ?? "未命名";
  const where = doc?.path ? `${name}（${doc.path}）` : name;
  const lines = [`[WPS 文档：${where}]`];
  if (context === "selection" && doc?.selection?.text) {
    lines.push("[当前选中的内容]", String(doc.selection.text), "[/当前选中的内容]");
  }
  lines.push("", text);
  return lines.join("\n");
}

/* ------------------------------------------------------------------------ static pages --- */

function publishPage(config, addinBase, addinUrl) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Adelie · WPS 加载项</title>
<style>
 body{font:14px/1.6 system-ui,-apple-system,"Microsoft YaHei",sans-serif;margin:0;padding:28px;color:#1f2328}
 h1{font-size:18px;margin:0 0 4px} p{margin:6px 0;color:#57606a}
 code{background:#f6f8fa;border-radius:6px;padding:2px 6px}
 button{font:inherit;padding:6px 14px;margin-right:8px;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;cursor:pointer}
 button.primary{background:#0969da;border-color:#0969da;color:#fff}
 #state{margin-top:16px;padding:12px;border:1px solid #d0d7de;border-radius:8px;background:#f6f8fa;white-space:pre-wrap}
</style></head><body>
<h1>把 Adelie 面板装进 WPS</h1>
<p>WPS 里登记的加载项目录：<code>${addinBase}</code> · 桥端口：<code>${config.port}</code></p>
<p>面板页面（想先看看长什么样就点开）：<code>${addinUrl}</code></p>
<p>点「安装 / 修复」会通过 WPS 自己的本机上架服务登记这个加载项（WPS 需要正在运行）。</p>
<p><button class="primary" onclick="act('enable')">安装 / 修复</button>
   <button onclick="act('disable')">停用</button>
   <button onclick="refresh()">刷新状态</button></p>
<div id="state">正在读取…</div>
<script>
 async function act(what){
   const r = await (await fetch('/publish/' + what, {method:'POST'})).json();
   document.getElementById('state').textContent = r.ok ? '已提交，正在核对…' : ('失败：' + r.error);
   setTimeout(refresh, 800);
 }
 async function refresh(){
   const r = await (await fetch('/publish/state')).json();
   document.getElementById('state').textContent =
     'WPS 上架服务：' + (r.relay ? '在运行' : '未启动（请先打开 WPS）') + '\\n' +
     'Adelie 加载项：' + (r.installed ? '已登记' : '未登记') + '\\n' +
     '当前加载项列表：' + JSON.stringify(r.addons);
 }
 refresh();
</script></body></html>`;
}

function statusPage(report) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Adelie WPS 桥</title>
<style>
 body{font:13px/1.6 ui-monospace,Menlo,Consolas,monospace;margin:0;padding:24px;color:#1f2328}
 h1{font-size:16px} pre{background:#f6f8fa;border:1px solid #d0d7de;border-radius:8px;padding:14px;overflow:auto}
</style></head><body>
<h1>Adelie WPS 桥 · v${KIT_VERSION}</h1>
<pre>${JSON.stringify(report, null, 2).replace(/[&<]/g, (c) => (c === "&" ? "&amp;" : "&lt;"))}</pre>
</body></html>`;
}

main().catch((err) => {
  process.stderr.write(`adelie-wps bridge failed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
