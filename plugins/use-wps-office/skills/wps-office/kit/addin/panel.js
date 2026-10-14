/**
 * Adelie WPS 面板 —— 任务窗格里的那一页（契约 §1 ribbon、§2 桥接口）
 *
 * 零依赖：原生 ES 模块 + 原生 DOM，没有框架、没有 CDN、没有外链资源。它同时要在
 * WPS 的任务窗格（Chromium 内核）和普通浏览器里跑：前者由 WPS 注入 window.wps，
 * 后者由 stub-wps.js 顶上（契约 §0、§4）。
 *
 * 三件事：
 *   1. window.ribbon —— WPS 宿主直接调，负责开关这个任务窗格（契约 §1）。
 *   2. 上下文本地报送 + 命令通道 —— 文档概况报给桥，桥推来的 doc.* 命令由 wps-api.js 执行（§2.1–2.3）。
 *   3. 聊天 —— 建会话、发问、流式回显、审批、把回复写进文档（§2.4）。
 */
import { runOperation } from "./wps-api.js";

const PANEL_VERSION = "1.0.0";
const TASKPANE_KEY = "adelie_taskpane_id";
const TASKPANE_WIDTH = 420; // 面板按 380–420px 宽设计（契约 §6）
const DOC_WATCH_INTERVAL = 1500; // 检查文档/选区变化的间隔
const HELLO_DEBOUNCE = 500; // 变化后 500ms 防抖再上报（契约 §2.1）
const EVENT_NAMES = ["status", "delta", "thinking", "tool", "approval", "done", "error"];
const THEME_KEY = "adelie.wps.theme";
const THINKING_KEY = "adelie.wps.thinking";
const CONTEXT_KEY = "adelie.wps.context";

/* ------------------------------------------------------------------ *
 * 普通浏览器里没有 WPS：装上假实现（契约 §4）
 * ------------------------------------------------------------------ */
const forcedStub = new URLSearchParams(location.search).has("stub");
if (forcedStub || (!window.wps && !window.Application)) {
  await import("./stub-wps.js");
}

/* ------------------------------------------------------------------ *
 * ribbon（契约 §1）—— WPS 宿主调用 window.ribbon
 * ------------------------------------------------------------------ */

function ribbonOnAddinLoad(ribbonUI) {
  try {
    window.Application.ribbonUI = ribbonUI;
    if (!window.Application.Enum || typeof window.Application.Enum !== "object") {
      // 老版本 WPS 不提供 app.Enum，补上任务窗格停靠需要的两个值。
      window.Application.Enum = { msoCTPDockPositionLeft: 0, msoCTPDockPositionRight: 2 };
    }
    log("info", "Adelie 加载项已就绪");
    return true;
  } catch (error) {
    console.error("[adelie] ribbon OnAddinLoad 失败：", error);
    log("error", "Adelie 加载项初始化失败", { message: String(error?.message ?? error) });
    return false;
  }
}

function ribbonOnAction(control) {
  const id = control?.Id ?? control?.id;
  if (id !== "btnAdeliePanel") return true;
  try {
    const app = window.Application;
    const paneId = app.PluginStorage.getItem(TASKPANE_KEY);
    if (!paneId) {
      const pane = app.CreateTaskPane(location.origin + "/addin/index.html", "Adelie");
      app.PluginStorage.setItem(TASKPANE_KEY, pane.ID);
      pane.DockPosition = app.Enum?.msoCTPDockPositionRight ?? 2;
      // 先把窗格显示出来再改宽度（WPS 已知的顺序坑，契约 §1）
      pane.Visible = true;
      pane.Width = window.devicePixelRatio * TASKPANE_WIDTH;
    } else {
      const pane = app.GetTaskPane(paneId);
      pane.Visible = !pane.Visible;
      pane.Width = window.devicePixelRatio * TASKPANE_WIDTH;
    }
    return true;
  } catch (error) {
    console.error("[adelie] 打开面板失败：", error);
    log("error", "打开 Adelie 面板失败", { message: String(error?.message ?? error) });
    return true;
  }
}

function ribbonGetImage() {
  // 图标就在加载项目录里，面板与桥同源，相对路径即可（契约 §1）。
  // 用 SVG 而不是 PNG：这个加载项目录会被插件加载器当文本读进内存，二进制会被 UTF-8 解码破坏。
  return "images/icon.svg";
}

window.ribbon = {
  OnAddinLoad: ribbonOnAddinLoad,
  OnAction: ribbonOnAction,
  GetImage: ribbonGetImage,
};

/* ------------------------------------------------------------------ *
 * 与桥说话（契约 §2）
 * ------------------------------------------------------------------ */

const BRIDGE = {
  async request(path, { method = "GET", body } = {}) {
    const init = { method, headers: {} };
    if (body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetch(path, init);
    } catch (error) {
      throw new Error(`连不上 Adelie 桥（${path}）：${error?.message ?? error}`);
    }
    const raw = await response.text();
    let payload = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        payload = null;
      }
    }
    if (!response.ok) {
      throw new Error(payload?.error ? String(payload.error) : `桥返回 HTTP ${response.status}`);
    }
    if (payload && payload.ok === false) {
      throw new Error(payload.error ? String(payload.error) : "桥没有说清失败原因");
    }
    return payload ?? { ok: true };
  },
};

/** 诊断日志（契约 §2.3）；日志本身失败不再上报，免得套娃。 */
function log(level, message, data) {
  try {
    void fetch("/addin/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level, message, data: data ?? {} }),
    }).catch(() => {});
  } catch (error) {
    // 桥不在也没关系。
  }
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(`[adelie] ${message}`, data ?? "");
}

/* ------------------------------------------------------------------ *
 * 面板状态
 * ------------------------------------------------------------------ */

const state = {
  doc: null, // 最近一次 doc.summary 的结果
  adelie: null, // 桥报上来的 Adelie 连接信息
  session: null, // { sessionId, projectId, model, running }
  connected: false,
  commandsConnected: false,
  eventsConnected: false,
  running: false, // 桥说它在忙（status 事件）
  sending: false, // 刚才那条 /panel/ask 还在飞
  context: "selection", // selection | document | none
  tail: 120,
  showThinking: true,
  fingerprint: "",
  debounce: null,
  turn: null, // 当前这一轮回复的 DOM 片段
  approvals: [], // 还没答的审批卡片
};

const dom = {};

function initDom() {
  dom.root = document.getElementById("app");
  dom.docLine = document.getElementById("doc-line");
  dom.sessionLine = document.getElementById("session-line");
  dom.connDot = document.getElementById("conn-dot");
  dom.connText = document.getElementById("conn-text");
  dom.theme = document.getElementById("theme");
  dom.contexts = document.getElementById("contexts");
  dom.messages = document.getElementById("messages");
  dom.empty = document.getElementById("empty");
  dom.form = document.getElementById("composer");
  dom.input = document.getElementById("input");
  dom.send = document.getElementById("send");
  dom.abort = document.getElementById("abort");
  dom.toasts = document.getElementById("toasts");
  dom.thinkingToggle = document.getElementById("thinking-toggle");
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "dataset") {
      for (const [dataKey, dataValue] of Object.entries(value)) node.dataset[dataKey] = dataValue;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function toast(message) {
  const node = el("div", { class: "toast", role: "status", text: message });
  dom.toasts.append(node);
  setTimeout(() => node.remove(), 3600);
}

/* ------------------------------------------------------------------ *
 * 文档上下文本地报送（契约 §2.1）
 * ------------------------------------------------------------------ */

async function collectDocument() {
  try {
    return await runOperation("doc.summary", {});
  } catch (error) {
    log("warn", "读取文档概况失败", { message: String(error?.message ?? error) });
    return null;
  }
}

function fingerprintOf(doc) {
  if (!doc) return "none";
  const selection = doc.selection ? `${doc.selection.from}-${doc.selection.to}` : "-";
  return [doc.name, doc.path, doc.paragraphs, selection].join("|");
}

async function sendHello(reason) {
  state.doc = await collectDocument();
  renderDocLine();
  try {
    const response = await BRIDGE.request("/addin/hello", {
      method: "POST",
      body: {
        doc: state.doc,
        panel: { version: PANEL_VERSION, ua: navigator.userAgent },
      },
    });
    state.adelie = response?.adelie ?? null;
    setConnected(true);
  } catch (error) {
    setConnected(false, String(error?.message ?? error));
    log("warn", "上报文档概况失败", { reason, message: String(error?.message ?? error) });
  }
  state.fingerprint = fingerprintOf(state.doc);
}

function startDocumentWatch() {
  setInterval(() => {
    void (async () => {
      const doc = await collectDocument();
      const fingerprint = fingerprintOf(doc);
      state.doc = doc;
      renderDocLine();
      if (fingerprint === state.fingerprint) return;
      // 选区或文档变了：500ms 防抖后再上报（契约 §2.1）
      state.fingerprint = fingerprint;
      clearTimeout(state.debounce);
      state.debounce = setTimeout(() => void sendHello("change"), HELLO_DEBOUNCE);
    })();
  }, DOC_WATCH_INTERVAL);
}

/* ------------------------------------------------------------------ *
 * 命令通道（契约 §2.2）
 * ------------------------------------------------------------------ */

function startCommandChannel() {
  const source = new EventSource("/addin/commands");
  const answered = new Set();
  const queue = [];
  let busy = false;

  const pump = () => {
    if (busy) return;
    const command = queue.shift();
    if (!command) return;
    busy = true;
    void (async () => {
      let payload;
      try {
        const result = await runOperation(command.op, command.args ?? {});
        payload = { id: command.id, ok: true, result };
      } catch (error) {
        // 失败也要回答（契约 §2.2）
        payload = { id: command.id, ok: false, error: String(error?.message ?? error) };
      }
      try {
        await BRIDGE.request("/addin/result", { method: "POST", body: payload });
      } catch (error) {
        log("error", "回答命令失败", { id: command.id, message: String(error?.message ?? error) });
        showErrorLine(`回答文档命令失败：${error?.message ?? error}`);
      }
      log(payload.ok ? "info" : "warn", `文档命令 ${command.op} ${payload.ok ? "完成" : "失败"}`, {
        id: command.id,
        ...(payload.ok ? { result: payload.result } : { error: payload.error }),
      });
      if (payload.ok && command.op !== "doc.summary") scheduleHello();
      busy = false;
      pump();
    })();
  };

  source.onmessage = (event) => {
    let command = null;
    try {
      command = JSON.parse(event.data);
    } catch (error) {
      log("warn", "收到看不懂的命令", { raw: String(event.data).slice(0, 200) });
      return;
    }
    if (!command || command.id === undefined || command.id === null) {
      log("warn", "命令没有 id，没法回答", { raw: String(event.data).slice(0, 200) });
      return;
    }
    if (answered.has(command.id)) return; // 同一个 id 只能回答一次
    answered.add(command.id);
    queue.push(command);
    pump();
  };
  source.onopen = () => {
    state.commandsConnected = true;
    renderConnection();
  };
  source.onerror = () => {
    // EventSource 会自己重连，这里只更新界面上的状态。
    state.commandsConnected = false;
    renderConnection();
  };
  return source;
}

/** 文档被命令改过之后，把新的概况补报一次（桥靠它校验改动）。 */
function scheduleHello() {
  clearTimeout(state.debounce);
  state.debounce = setTimeout(() => void sendHello("command"), HELLO_DEBOUNCE);
}

/* ------------------------------------------------------------------ *
 * 聊天（契约 §2.4）
 * ------------------------------------------------------------------ */

function startEventStream() {
  const source = new EventSource("/panel/events");
  const handle = (name, event) => {
    let data = {};
    try {
      data = event.data ? JSON.parse(event.data) : {};
    } catch (error) {
      log("warn", "收到看不懂的流事件", { name, raw: String(event.data).slice(0, 200) });
      return;
    }
    applyEvent(name, data);
  };
  for (const name of EVENT_NAMES) source.addEventListener(name, (event) => handle(name, event));
  // 桥若用默认事件名并把类型放在载荷里，也认。
  source.onmessage = (event) => {
    let data = {};
    try {
      data = event.data ? JSON.parse(event.data) : {};
    } catch (error) {
      return;
    }
    const name =
      typeof data?.type === "string"
        ? data.type
        : typeof data?.event === "string"
          ? data.event
          : "";
    if (EVENT_NAMES.includes(name)) applyEvent(name, data);
  };
  source.onopen = () => {
    state.eventsConnected = true;
    renderConnection();
  };
  source.onerror = () => {
    state.eventsConnected = false;
    renderConnection();
  };
  return source;
}

function applyEvent(name, data) {
  switch (name) {
    case "status":
      setRunning(Boolean(data?.running));
      break;
    case "delta":
      appendDelta(typeof data?.text === "string" ? data.text : "");
      break;
    case "thinking":
      appendThinking(typeof data?.text === "string" ? data.text : "");
      break;
    case "tool":
      appendToolLine(data ?? {});
      break;
    case "approval":
      showApproval(data ?? {});
      break;
    case "done":
      finishTurn(typeof data?.text === "string" ? data.text : "");
      break;
    case "error":
      showErrorLine(String(data?.message ?? "Adelie 报了一个没有说明的错误"));
      setRunning(false);
      break;
    default:
      break;
  }
}

function ensureTurn() {
  if (state.turn) return state.turn;
  dom.empty?.setAttribute("hidden", "hidden");
  const text = el("div", { class: "turn-text" });
  const tools = el("div", { class: "turn-tools" });
  const thinkingBody = el("div", { class: "thinking-body" });
  const thinkingWrap = el("details", { class: "thinking" }, [
    el("summary", {}, [el("span", { text: "思考过程" })]),
    thinkingBody,
  ]);
  thinkingWrap.hidden = true;
  const actions = el("div", { class: "turn-actions" });
  const bubble = el("article", { class: "msg assistant", role: "article" }, [
    thinkingWrap,
    tools,
    text,
    actions,
  ]);
  dom.messages.append(bubble);
  state.turn = {
    bubble,
    textEl: text,
    text: "",
    toolsEl: tools,
    thinkingWrap,
    thinkingBody,
    thinkingText: "",
    actions,
  };
  scrollToBottom();
  return state.turn;
}

function appendDelta(chunk) {
  if (!chunk && state.turn) return;
  const turn = ensureTurn();
  turn.text += chunk;
  turn.textEl.textContent = turn.text;
  if (chunk && turn.thinkingWrap && !turn.thinkingWrap.hidden) turn.thinkingWrap.open = false;
  scrollToBottom();
}

function appendThinking(chunk) {
  if (!state.showThinking) return;
  const turn = ensureTurn();
  turn.thinkingText += chunk;
  turn.thinkingWrap.hidden = false;
  turn.thinkingBody.textContent = turn.thinkingText;
  scrollToBottom();
}

function appendToolLine(data) {
  const turn = ensureTurn();
  const name = String(data?.name ?? "工具");
  const summary = data?.summary ? String(data.summary) : "";
  const stateName = ["running", "done", "failed"].includes(data?.state) ? data.state : "running";
  let line = turn.toolsEl.querySelector(`[data-tool-id="${data?.id ?? name}"]`);
  if (!line) {
    line = el("p", { class: "tool-line", dataset: { toolId: data?.id ?? name } }, [
      el("span", { class: "tool-name", text: name }),
      el("span", { class: "tool-summary", text: summary }),
    ]);
    turn.toolsEl.append(line);
  } else {
    line.querySelector(".tool-summary").textContent = summary;
  }
  line.dataset.state = stateName;
  scrollToBottom();
}

function finishTurn(finalText) {
  const turn = ensureTurn();
  if (finalText) turn.text = finalText;
  turn.textEl.textContent = turn.text;
  setRunning(false);
  if (turn.thinkingWrap && turn.thinkingText) turn.thinkingWrap.open = false;
  if (!turn.actions.querySelector(".write-btn")) {
    const write = el("button", {
      class: "btn secondary write-btn",
      type: "button",
      text: "写进文档",
      onclick: () => void writeTurnIntoDocument(turn),
    });
    turn.actions.append(write);
  }
  if (!turn.text.trim())
    turn.textEl.append(el("span", { class: "caption", text: "（这一轮没有文字回复）" }));
  scrollToBottom();
}

function showApproval(data) {
  const toolCallId = data?.toolCallId ? String(data.toolCallId) : "";
  const name = String(data?.name ?? "工具");
  const summary = data?.summary ? String(data.summary) : "";
  const actions = el("div", { class: "approval-actions" });
  const card = el(
    "div",
    { class: "approval", role: "alertdialog", "aria-label": `需要允许：${name}` },
    [
      el("p", { class: "approval-title", text: `${name} 需要你的允许` }),
      el("p", { class: "approval-summary", text: summary }),
      actions,
    ],
  );
  const approve = el("button", { class: "btn primary", type: "button", text: "允许" });
  const deny = el("button", { class: "btn secondary", type: "button", text: "拒绝" });
  const answer = async (decision) => {
    approve.disabled = true;
    deny.disabled = true;
    try {
      await BRIDGE.request("/panel/approve", { method: "POST", body: { toolCallId, decision } });
      card.replaceChildren(
        el("p", {
          class: "caption",
          text: decision === "allow" ? `已允许 ${name}` : `已拒绝 ${name}`,
        }),
      );
      card.classList.add("answered");
    } catch (error) {
      showErrorLine(`回答审批失败：${error?.message ?? error}`);
      approve.disabled = false;
      deny.disabled = false;
    }
    state.approvals = state.approvals.filter((item) => item.card !== card);
  };
  approve.addEventListener("click", () => void answer("allow"));
  deny.addEventListener("click", () => void answer("deny"));
  actions.append(approve, deny);
  dom.messages.append(card);
  state.approvals.push({ card, deny: () => void answer("deny") });
  scrollToBottom();
  approve.focus();
}

function showErrorLine(message) {
  const line = el("p", { class: "error-line", role: "alert", text: message });
  dom.messages.append(line);
  scrollToBottom();
}

async function sendMessage() {
  const text = dom.input.value.trim();
  if (!text || state.running || state.sending) return;
  appendUserMessage(text);
  dom.input.value = "";
  autoGrow();
  state.turn = null;
  // 只在这条请求飞出去之前锁一下，防连点；之后是「忙」还是「闲」由桥的 status 事件说了算（契约 §2.4）
  setSending(true);
  try {
    await BRIDGE.request("/panel/ask", {
      method: "POST",
      body: { text, context: state.context, tail: state.tail },
    });
  } catch (error) {
    showErrorLine(`发送失败：${error?.message ?? error}`);
  } finally {
    setSending(false);
  }
}

function appendUserMessage(text) {
  dom.empty?.setAttribute("hidden", "hidden");
  dom.messages.append(el("article", { class: "msg user", role: "article" }, [el("div", { text })]));
  scrollToBottom();
}

function appendHistoryMessage(message) {
  const role = message?.role === "user" ? "user" : "assistant";
  const text = String(message?.text ?? "");
  if (!text) return;
  dom.empty?.setAttribute("hidden", "hidden");
  if (role === "user") appendUserMessage(text);
  else
    dom.messages.append(
      el("article", { class: "msg assistant" }, [el("div", { class: "turn-text", text })]),
    );
}

let historyLoaded = false;

/** 面板打开时把这篇文档已经聊过的内容补上，用户才看得到上下文。 */
async function loadHistory() {
  if (historyLoaded) return;
  historyLoaded = true;
  try {
    const response = await BRIDGE.request("/panel/history?limit=50");
    for (const message of response?.messages ?? []) appendHistoryMessage(message);
    scrollToBottom();
  } catch (error) {
    log("warn", "读取历史失败", { message: String(error?.message ?? error) });
  }
}

async function abortTurn() {
  try {
    await BRIDGE.request("/panel/abort", { method: "POST" });
    setRunning(false);
    toast("已请求停止");
  } catch (error) {
    showErrorLine(`停止失败：${error?.message ?? error}`);
  }
}

async function writeTurnIntoDocument(turn) {
  const text = turn.text.trim();
  if (!text) {
    toast("这一轮没有可写入的文字");
    return;
  }
  const doc = state.doc ?? (await collectDocument());
  let index = doc?.selection?.to ?? doc?.paragraphs ?? 1;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  try {
    for (const line of lines) {
      const result = await runOperation("doc.insertAfter", { index, text: line });
      index = result.index;
    }
    await runOperation("doc.reveal", { index: Math.max(1, index - lines.length + 1) });
    toast(`已写入 ${lines.length} 段`);
    scheduleHello();
  } catch (error) {
    showErrorLine(`写入文档失败：${error?.message ?? error}`);
  }
}

async function ensureSession() {
  try {
    const current = await BRIDGE.request("/panel/state");
    state.adelie = current?.adelie ?? state.adelie;
    state.session = current?.session ?? null;
  } catch (error) {
    log("warn", "读取面板状态失败", { message: String(error?.message ?? error) });
  }
  if (!state.session) {
    try {
      const created = await BRIDGE.request("/panel/session", { method: "POST" });
      state.session = {
        sessionId: created?.sessionId ?? "",
        projectId: created?.projectId ?? "",
        model: created?.model ?? "",
        running: false,
      };
    } catch (error) {
      log("warn", "建立会话失败", { message: String(error?.message ?? error) });
      showErrorLine(`还没连上 Adelie：${error?.message ?? error}`);
    }
  }
  renderSessionLine();
  void loadHistory();
}

/* ------------------------------------------------------------------ *
 * 界面
 * ------------------------------------------------------------------ */

function setConnected(connected, message) {
  state.connected = connected;
  renderConnection(message);
  renderDocLine();
}

function renderConnection(message) {
  dom.connDot?.classList.toggle("on", state.connected);
  if (!dom.connText) return;
  dom.connText.textContent = state.connected ? "已连接 Adelie" : "未连接";
  dom.connText.title = state.connected
    ? `桥：${state.adelie?.origin ?? location.origin}`
    : (message ?? "没有连上 Adelie 桥，文档命令收不到");
}

function renderDocLine() {
  if (!dom.docLine) return;
  const doc = state.doc;
  if (!doc) {
    dom.docLine.textContent = "没读到文档（先在 WPS 里打开一篇）";
    return;
  }
  const name = doc.name || "未命名文档";
  const selection = doc.selection ? ` · 选中第 ${doc.selection.from}–${doc.selection.to} 段` : "";
  dom.docLine.textContent = `${name} · ${doc.paragraphs} 段${selection}`;
  dom.docLine.title = doc.path || name;
}

function renderSessionLine() {
  if (!dom.sessionLine) return;
  dom.sessionLine.textContent = state.session?.model ? `模型 ${state.session.model}` : "";
}

function setRunning(running) {
  state.running = running;
  renderSendState();
}

/** 发送请求在飞的这一小段时间：防连点，但不改变「桥说它还在忙」这个状态。 */
function setSending(sending) {
  state.sending = sending;
  renderSendState();
}

function renderSendState() {
  const busy = state.running || state.sending;
  if (dom.send) dom.send.disabled = busy;
  if (dom.abort) dom.abort.hidden = !state.running;
  if (dom.input) dom.input.placeholder = busy ? "Adelie 正在处理…" : "让 Adelie 改这篇文档…";
}

function scrollToBottom() {
  if (dom.messages) dom.messages.scrollTop = dom.messages.scrollHeight;
}

function autoGrow() {
  if (!dom.input) return;
  dom.input.style.height = "auto";
  dom.input.style.height = `${Math.min(dom.input.scrollHeight, 160)}px`;
}

function setContext(context) {
  state.context = context;
  localStorage.setItem(CONTEXT_KEY, context);
  for (const chip of dom.contexts.querySelectorAll(".chip")) {
    chip.setAttribute("aria-pressed", String(chip.dataset.context === context));
  }
}

function setThinking(show) {
  state.showThinking = show;
  localStorage.setItem(THINKING_KEY, show ? "1" : "0");
  if (dom.thinkingToggle) dom.thinkingToggle.setAttribute("aria-pressed", String(show));
  if (dom.messages) dom.messages.classList.toggle("hide-thinking", !show);
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const preferred = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(stored || preferred);
}

function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(THEME_KEY, theme);
  if (dom.theme)
    dom.theme.setAttribute("aria-label", theme === "dark" ? "切换到浅色" : "切换到深色");
}

function bindUi() {
  dom.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendMessage();
  });
  dom.input.addEventListener("input", autoGrow);
  dom.input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // 中文输入法组字时的回车只是上屏，不能当发送（IME 安全，见 web-design 规范）
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void sendMessage();
  });
  dom.abort.addEventListener("click", () => void abortTurn());
  dom.theme.addEventListener("click", () => {
    applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  });
  dom.contexts.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (chip?.dataset.context) setContext(chip.dataset.context);
  });
  dom.thinkingToggle.addEventListener("click", () => setThinking(!state.showThinking));
  for (const button of document.querySelectorAll("[data-example]")) {
    button.addEventListener("click", () => {
      dom.input.value = button.dataset.example;
      autoGrow();
      dom.input.focus();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.approvals.length) return;
    // Esc 关掉最上面那张审批卡片（等同拒绝），焦点回到对话区
    const pending = state.approvals.pop();
    pending.deny();
    dom.messages.focus();
  });
}

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

function boot() {
  initDom();
  bindUi();
  initTheme();
  setContext(localStorage.getItem(CONTEXT_KEY) || "selection");
  setThinking(localStorage.getItem(THINKING_KEY) !== "0");
  setRunning(false);
  renderDocLine();

  startDocumentWatch();
  startCommandChannel();
  startEventStream();
  // 先报文档再建会话：桥按文档认会话，反过来的话第一次开面板会撞上「还没有打开文档」。
  void (async () => {
    await sendHello("boot");
    await ensureSession();
  })();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
