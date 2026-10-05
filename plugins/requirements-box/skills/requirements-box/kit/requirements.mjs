// /opt/adelie-design/requirements.mjs
//
// 「需求箱」——用户提需求、Adelie 定时处理的那一页与它背后的几个接口。
//
// 为什么插在这里而不是另起一个进程：用户的口径是「服务就插入原本的 3003」（2026-10-06）。
// 3003 上本来就是这个静态服务，多一个端口就多一份要盯的东西；需求箱的流量与静态页完全
// 不是一个量级，塞进同一个事件循环没有代价。
//
// 只用 Node 标准库，和 server.mjs 一个理由：这一页没有构建步骤，也不该为了收几条需求装
// 一个依赖树。存储用一个 JSON 文件 + 原子替换（写临时文件再 rename），份量就这么多。
//
// 鉴权不是可选项：这一页在公网上（同一个站点还挂着安装包下载），而没有鉴权的提交口等于
// 把「让 Adelie 干点什么」的能力开放给任何人 —— 定时任务会照着需求里的字去改代码。因此
// 读写全部要求一个口令（`x-adelie-key` 头或 `?key=`），口令第一次启动时随机生成、0600
// 落在数据目录里，只在用户自己的书签里出现。
//
// 数据放在 ROOT 之外的 REQUIREMENTS_DIR（默认 /opt/adelie-design-requirements）：静态
// 服务器按前缀路径发文件，数据放在它够得着的地方意味着 items.json 可以被任何人下载。

import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 本机配置不写进代码：优先级 环境变量 > 同目录的 `box.config.json` > 中性默认值。
 * 那份 json 由安装脚本（kit/install.mjs）生成，也可以照 `box.config.example.json` 手写 ——
 * 这样同一份代码在别人的机器上照样跑，不必改源码。
 */
function loadConfig() {
  try {
    return JSON.parse(readFileSync(join(HERE, "box.config.json"), "utf8"));
  } catch {
    return {};
  }
}

const CONFIG = loadConfig();
const pick = (envKey, configKey, fallback) => process.env[envKey] ?? CONFIG[configKey] ?? fallback;

const DATA_DIR = pick("REQUIREMENTS_DIR", "dataDir", join(HERE, "data"));
const ITEMS_FILE = join(DATA_DIR, "items.json");
const KEY_FILE = join(DATA_DIR, "key.txt");
const PAGE_FILE = join(HERE, "requirements.html");
const PATROL_TOML = pick("PATROL_TOML", "patrolToml", "");
const PENGUIN_BIN = pick("PENGUIN_BIN", "penguinBin", "penguin");
const PATROL_PROJECT = pick("PATROL_PROJECT", "project", "");
const PATROL_AGENT = pick("PATROL_AGENT", "agent", "");
const PATROL_WORKSPACE = pick("PATROL_WORKSPACE", "workspace", process.cwd());

/** 状态的封闭集合。`new` 是刚提上来还没被看过的；`doing` 是这一轮正在做的。 */
const STATUSES = new Set(["new", "doing", "done", "blocked", "rejected", "withdrawn"]);

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  if (!existsSync(KEY_FILE)) {
    const key = randomBytes(24).toString("hex");
    writeFileSync(KEY_FILE, key + "\n", { mode: 0o600 });
    console.log(`需求箱口令已生成：${KEY_FILE}（只有这个文件里有一份）`);
  }
}

function readKey() {
  return readFileSync(KEY_FILE, "utf8").trim();
}

function load() {
  if (!existsSync(ITEMS_FILE)) return { seq: 0, items: [] };
  try {
    const parsed = JSON.parse(readFileSync(ITEMS_FILE, "utf8"));
    if (!Array.isArray(parsed.items)) return { seq: 0, items: [] };
    return { seq: Number(parsed.seq) || parsed.items.length, items: parsed.items };
  } catch (err) {
    // 文件坏了不能装作没有需求：把坏文件挪开留证，再从空的开始，别把用户提过的东西
    // 直接覆盖掉。
    const broken = `${ITEMS_FILE}.broken-${Date.now()}`;
    renameSync(ITEMS_FILE, broken);
    console.log(`需求箱数据文件读不动（${err.message}），已挪到 ${broken}`);
    return { seq: 0, items: [] };
  }
}

function save(state) {
  const tmp = `${ITEMS_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, ITEMS_FILE);
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(payload)),
  });
  res.end(payload);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function keyOk(url, req) {
  const expected = readKey();
  const given = req.headers["x-adelie-key"] ?? url.searchParams.get("key") ?? "";
  const a = Buffer.from(String(given));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 一条需求的形状：提上来是什么、后来变成什么，都留在 events 里，不覆盖历史。 */
function makeItem(state, input) {
  const now = new Date().toISOString();
  state.seq += 1;
  const notBefore = normalizeNotBefore(input.not_before);
  return {
    id: `req-${state.seq}`,
    seq: state.seq,
    title: String(input.title ?? "")
      .trim()
      .slice(0, 200),
    detail: String(input.detail ?? "")
      .trim()
      .slice(0, 20000),
    priority: input.priority === "high" ? "high" : "normal",
    status: "new",
    // 排期：到这个时刻之后再动手；null / 缺省 = 尽快。上一轮没到点的条目由巡台自己跳过，
    // 状态仍是 new，不占工位也不发邮件。
    not_before: Number.isNaN(notBefore) ? null : (notBefore ?? null),
    created_at: now,
    updated_at: now,
    events: [{ at: now, status: "new", note: "已收到" }],
  };
}

/**
 * 排期的规范化：缺省（undefined）表示「这次请求没提这件事」，保持不变；空串或 null 表示
 * 清掉排期（尽快）；其它值要能解析成时间，解析不了返回 NaN 由调用方拒掉。
 */
function normalizeNotBefore(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : NaN;
}

// --- 巡台节奏 ---------------------------------------------------------------
//
// 这一页管的不只是「提什么」，还有「多久来看一次」。巡台的实体是 agent_state/schedule/
// 下的一个定时任务文件，harness 每 30 秒重读一次目录 —— 改这个文件就等于改节奏，不用重启
// 任何东西。所以页面上那个「巡台节奏」直接写它，写完把原文备一份到数据目录，改坏了能翻回去。
const PATROL_BACKUP = join(DATA_DIR, "patrol-toml.bak");

/** 没配巡台时，错误信息要指向那份配置，而不是一个空路径。 */
function patrolMissing() {
  return PATROL_TOML
    ? `读不到定时任务文件：${PATROL_TOML}`
    : "还没配巡台：在 box.config.json 里写 patrolToml（或设环境变量 PATROL_TOML）指向那个定时任务文件";
}
/** 允许的节奏。`24h` 另有一条「每天几点」的路，那条也是写 24h，只是起点对齐到钟点。 */
const PERIOD_MS = {
  "30m": 1800e3,
  "1h": 3600e3,
  "90m": 5400e3,
  "2h": 7200e3,
  "3h": 10800e3,
  "4h": 14400e3,
  "6h": 21600e3,
  "8h": 28800e3,
  "12h": 43200e3,
  "24h": 86400e3,
};

function patrolPeriodMs(period) {
  const m = /^(\d+)([mhd])$/.exec(String(period ?? "").trim());
  if (!m) return 0;
  return Number(m[1]) * { m: 60e3, h: 3600e3, d: 86400e3 }[m[2]];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** 下一个「整点对齐」的触发时刻：2h 就是 00:00 / 02:00 …，用的是本机时区。 */
function nextLocalBoundary(periodMs) {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60e3;
  const local = now.getTime() - offsetMs;
  return new Date((Math.floor(local / periodMs) + 1) * periodMs + offsetMs);
}

/** 今天（或明天）的某个本机钟点。 */
function nextLocalTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const now = new Date();
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

/** 读定时任务文件。读不到返回 null —— 调用方据此报错，不假装节奏还在。 */
function readPatrol() {
  let text;
  try {
    text = readFileSync(PATROL_TOML, "utf8");
  } catch {
    return null;
  }
  const one = (key) => {
    const m = text.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  };
  const period = one("period");
  const startAt = one("start_at");
  const startMs = Date.parse(startAt ?? "");
  const periodMs = patrolPeriodMs(period);
  let nextAt = null;
  if (Number.isFinite(startMs)) {
    if (periodMs > 0) {
      const now = Date.now();
      const steps = now < startMs ? 0 : Math.floor((now - startMs) / periodMs) + 1;
      nextAt = new Date(startMs + steps * periodMs).toISOString();
    } else {
      nextAt = startAt;
    }
  }
  const daily = periodMs === 86400e3 && Number.isFinite(startMs);
  const at = Number.isFinite(startMs) ? new Date(startMs) : null;
  return {
    file: PATROL_TOML,
    enabled: one("enabled") === "true",
    period,
    start_at: startAt,
    next_at: nextAt,
    mode: daily ? "daily" : "interval",
    daily_at: daily ? `${pad2(at.getHours())}:${pad2(at.getMinutes())}` : null,
  };
}

/**
 * 写回定时任务文件：只动 enabled / start_at / period 三行，prompt 与 workspace 原样留着 ——
 * 那段 prompt 是这一页真正要跑的活，格式一坏整个巡台就哑了。
 */
function writePatrol({ enabled, period, startAt }) {
  const text = readFileSync(PATROL_TOML, "utf8");
  writeFileSync(PATROL_BACKUP, text, { mode: 0o600 });
  const lines = text
    .split("\n")
    .filter((line) => !/^(enabled|start_at|period)\s*=/.test(line.trim()));
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  lines.push(`enabled = ${enabled ? "true" : "false"}`);
  lines.push(`start_at = ${startAt}`);
  lines.push(`period = "${period}"`);
  const tmp = `${PATROL_TOML}.tmp`;
  writeFileSync(tmp, lines.join("\n") + "\n", { mode: 0o600 });
  renameSync(tmp, PATROL_TOML);
}

// --- 立即跑一轮 -------------------------------------------------------------
//
// 定时任务最快也得等到下一个整点，而「万一我现在就要」是常态。这里给页面一个按钮：直接让
// 平台开一个新会话，把巡台那段 prompt 发过去，现在就跑。
//
// 走的是 `penguin run --background`：CLI 把任务交给服务端就退出，真正跑的是平台里的那个会话
// —— 所以浏览器关掉、3003 重启，那一轮也不受影响。子进程用的是干净环境（不继承本服务的
// HOST/PORT/ROOT），CLI 自己认本机那个 server.lock 与 api-token。
//
// 这不是一个「便宜」的按钮：它会真的开一个会话去改代码、过门禁、发版、更新现网。所以有
// 60 秒冷却（手抖点两下不会开两个会话），页面上还有一次确认。
const RUN_COOLDOWN_MS = 60 * 1000;
const SESSION_ID_RE = /session-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-[0-9a-f]{8}/;

let lastManualRun = { at: 0, ids: [], session_id: null };

/** 巡台那段 prompt 的唯一出处是定时任务文件，这里读它，改准则不用改两处。 */
function patrolPrompt() {
  try {
    const m = readFileSync(PATROL_TOML, "utf8").match(/^prompt\s*=\s*"""([\s\S]*?)"""/m);
    if (m) return m[1].trim();
  } catch {
    // 读不到就落回下面这句，总比什么都不做要强
  }
  return "按 /root/evolution/REQUIREMENTS.md 跑一轮「需求箱巡台」。";
}

function patrolMessage(ids) {
  const lines = [patrolPrompt(), ""];
  if (ids.length > 0) {
    lines.push(
      `【用户刚在页面上点了「现在就做」】这一轮先做这几条，按他点的顺序：${ids.join("、")}。`,
    );
    lines.push("不管它们是什么紧急程度，都排进这一轮要做的条目里；其余照准则走。");
  } else {
    lines.push(
      "【用户刚在页面上点了「现在就跑一轮」】这是他在定时之外额外要的一轮，别等下一次定点。",
    );
  }
  return lines.join("\n");
}

/** 起了就返回，不为它等多久 —— 12 秒拿不到会话号也照样告诉用户「叫醒了」。 */
function spawnPatrol(ids, res) {
  const now = Date.now();
  const waited = now - lastManualRun.at;
  if (waited < RUN_COOLDOWN_MS) {
    json(res, 429, {
      ok: false,
      error: `刚叫过一次（${Math.round(waited / 1000)} 秒前），${Math.ceil((RUN_COOLDOWN_MS - waited) / 1000)} 秒后可以再叫`,
    });
    return;
  }

  let out = "";
  let child;
  try {
    // 没配的项就不传这个参数 —— 让 penguin CLI 用它自己的默认（当前项目 / 默认 Agent），
    // 传一个空串反而会被当成一个真的 id。
    const args = ["run", "--background"];
    if (PATROL_PROJECT) args.push("--project-id", PATROL_PROJECT);
    if (PATROL_AGENT) args.push("--agent-id", PATROL_AGENT);
    args.push("--workspace", PATROL_WORKSPACE, "-m", patrolMessage(ids));
    child = spawn(PENGUIN_BIN, args, {
      cwd: PATROL_WORKSPACE,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        HOME: process.env.HOME ?? "/root",
        PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      },
    });
  } catch (err) {
    json(res, 500, { ok: false, error: `起不来：${err.message}` });
    return;
  }

  lastManualRun = { at: now, ids, session_id: null };
  let answered = false;
  const answer = (pending, code) => {
    if (answered) return;
    answered = true;
    clearTimeout(timer);
    const sid = (out.match(SESSION_ID_RE) ?? [null])[0];
    lastManualRun.session_id = sid;
    const at = new Date(now).toISOString();
    if (sid) console.log(`手动触发巡台：${sid}${ids.length ? `（优先 ${ids.join("、")}）` : ""}`);
    else console.log(`手动触发巡台：没读到会话号（exit=${code}）${out.trim().slice(0, 200)}`);
    json(res, 200, {
      ok: true,
      session_id: sid,
      pending,
      ids,
      at,
      output: sid ? undefined : out.trim().slice(0, 400),
    });
  };
  const timer = setTimeout(() => answer(true), 12000);
  child.stdout?.on("data", (d) => {
    out += String(d);
  });
  child.stderr?.on("data", (d) => {
    out += String(d);
  });
  child.on("error", (err) => {
    out += String(err.message);
    answer(false, "error");
  });
  child.on("exit", (code) => answer(false, code));
  child.unref();
}

const PAGE_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function sendPage(res) {
  let html;
  try {
    html = readFileSync(PAGE_FILE, "utf8");
  } catch (err) {
    json(res, 500, { ok: false, error: `需求箱页面读不到：${err.message}` });
    return;
  }
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": PAGE_CSP,
    "x-content-type-options": "nosniff",
  });
  res.end(html);
}

/**
 * 需求箱的路由。返回 true 表示这个请求归它管（已经响应过了），false 表示交回静态服务器。
 * 前缀只有两个：页面 `/requirements`，接口 `/api/requirements`。
 */
export function handleRequirements(req, res, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl, "http://localhost");
  } catch {
    return false;
  }
  const path = url.pathname;

  if (path === "/requirements" || path === "/requirements/") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      json(res, 405, { ok: false, error: "只支持 GET" });
      return true;
    }
    sendPage(res);
    return true;
  }

  if (path !== "/api/requirements" && !path.startsWith("/api/requirements/")) return false;

  if (!keyOk(url, req)) {
    json(res, 401, { ok: false, error: "口令不对（x-adelie-key 头或 ?key=）" });
    return true;
  }

  const tail = path.slice("/api/requirements".length).replace(/^\//, "");
  const method = req.method ?? "GET";

  if (tail === "") {
    if (method === "GET") {
      const state = load();
      const wanted = url.searchParams.get("status");
      const statuses = wanted ? wanted.split(",").map((s) => s.trim()) : null;
      const archived = url.searchParams.get("archived");
      let items = state.items;
      if (statuses) items = items.filter((i) => statuses.includes(i.status));
      // 归档是一个视图，不是另一个库：做过的东西留在同一个文件里，默认不返回。
      if (archived === "1") items = items.filter((i) => i.archived_at);
      else items = items.filter((i) => !i.archived_at);
      const limit = Number(url.searchParams.get("limit"));
      if (Number.isFinite(limit) && limit > 0) items = items.slice(-limit);
      json(res, 200, { ok: true, seq: state.seq, count: items.length, items });
      return true;
    }

    if (method === "POST") {
      readBody(req)
        .then((raw) => {
          let input;
          try {
            input = JSON.parse(raw || "{}");
          } catch {
            json(res, 400, { ok: false, error: "正文不是 JSON" });
            return;
          }
          if (typeof input.title !== "string" || input.title.trim() === "") {
            json(res, 400, { ok: false, error: "标题不能为空" });
            return;
          }
          const state = load();
          const item = makeItem(state, input);
          state.items.push(item);
          save(state);
          console.log(`需求箱收到 ${item.id}：${item.title}`);
          json(res, 201, { ok: true, item });
        })
        .catch((err) => json(res, 413, { ok: false, error: err.message }));
      return true;
    }

    json(res, 405, { ok: false, error: "只支持 GET / POST" });
    return true;
  }

  // 立即跑一轮：/api/requirements/run（GET 看上次叫它是什么时候）
  if (tail === "run") {
    if (method === "GET") {
      json(res, 200, { ok: true, last: lastManualRun });
      return true;
    }
    if (method === "POST") {
      readBody(req)
        .then((raw) => {
          let input;
          try {
            input = JSON.parse(raw || "{}");
          } catch {
            json(res, 400, { ok: false, error: "正文不是 JSON" });
            return;
          }
          let ids = [];
          if (Array.isArray(input.ids) && input.ids.length > 0) {
            ids = input.ids
              .map(String)
              .filter((s) => /^req-\d+$/.test(s))
              .slice(0, 20);
            if (ids.length === 0) {
              json(res, 400, { ok: false, error: "要做的条目 id 不对（形如 req-3）" });
              return;
            }
          }
          spawnPatrol(ids, res);
        })
        .catch((err) => json(res, 413, { ok: false, error: err.message }));
      return true;
    }
    json(res, 405, { ok: false, error: "只支持 GET / POST" });
    return true;
  }

  // 节奏：/api/requirements/patrol
  if (tail === "patrol") {
    if (method === "GET") {
      const patrol = readPatrol();
      if (!patrol) {
        json(res, 500, { ok: false, error: patrolMissing() });
        return true;
      }
      json(res, 200, { ok: true, patrol });
      return true;
    }
    if (method === "PATCH" || method === "POST") {
      readBody(req)
        .then((raw) => {
          let patch;
          try {
            patch = JSON.parse(raw || "{}");
          } catch {
            json(res, 400, { ok: false, error: "正文不是 JSON" });
            return;
          }
          const current = readPatrol();
          if (!current) {
            json(res, 500, { ok: false, error: patrolMissing() });
            return;
          }
          const enabled = patch.enabled === undefined ? current.enabled : patch.enabled === true;
          let period = current.period;
          let startAt = current.start_at;

          if (patch.daily_at !== undefined && patch.daily_at !== null && patch.daily_at !== "") {
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(patch.daily_at))) {
              json(res, 400, { ok: false, error: "每天几点要写成 HH:MM（24 小时制）" });
              return;
            }
            period = "24h";
            startAt = nextLocalTime(String(patch.daily_at)).toISOString();
          } else if (patch.period !== undefined && patch.period !== null && patch.period !== "") {
            if (!Object.hasOwn(PERIOD_MS, String(patch.period))) {
              json(res, 400, {
                ok: false,
                error: `节奏只能是：${Object.keys(PERIOD_MS).join(" / ")}`,
              });
              return;
            }
            period = String(patch.period);
            startAt = nextLocalBoundary(PERIOD_MS[period]).toISOString();
          } else if (patch.mode === "daily" && current.daily_at) {
            // 只切模式不改钟点：沿用现在那个点，但把下一次算到今天的这个点。
            period = "24h";
            startAt = nextLocalTime(current.daily_at).toISOString();
          }

          writePatrol({ enabled, period, startAt });
          const patrol = readPatrol();
          console.log(
            `巡台节奏更新：${patrol.enabled ? "开" : "暂停"} · 每 ${patrol.period} · 下一次 ${patrol.next_at}`,
          );
          json(res, 200, { ok: true, patrol });
        })
        .catch((err) => json(res, 413, { ok: false, error: err.message }));
      return true;
    }
    json(res, 405, { ok: false, error: "只支持 GET / PATCH" });
    return true;
  }

  // 单条：/api/requirements/<id>
  const id = tail.split("/")[0];
  const state = load();
  const item = state.items.find((i) => i.id === id);
  if (!item) {
    json(res, 404, { ok: false, error: `没有这条需求：${id}` });
    return true;
  }

  if (method === "GET") {
    json(res, 200, { ok: true, item });
    return true;
  }

  if (method === "PATCH" || method === "POST") {
    readBody(req)
      .then((raw) => {
        let patch;
        try {
          patch = JSON.parse(raw || "{}");
        } catch {
          json(res, 400, { ok: false, error: "正文不是 JSON" });
          return;
        }
        if (patch.status !== undefined) {
          if (!STATUSES.has(patch.status)) {
            json(res, 400, { ok: false, error: `状态只能是：${[...STATUSES].join(" / ")}` });
            return;
          }
          item.status = patch.status;
        }

        // 改内容：标题、说明、紧急程度。已经归档的是一条记录，不再改 —— 归档之后还要改，
        // 说明该另外提一条。
        if (item.archived_at) {
          const onlyArchive =
            patch.status === undefined &&
            patch.note === undefined &&
            patch.result === undefined &&
            patch.commits === undefined &&
            patch.version === undefined &&
            patch.title === undefined &&
            patch.detail === undefined &&
            patch.priority === undefined;
          if (!onlyArchive) {
            json(res, 409, { ok: false, error: "这条已经归档，改不了；要改就另提一条" });
            return;
          }
        }
        const edits = [];
        if (typeof patch.title === "string") {
          const title = patch.title.trim().slice(0, 200);
          if (title === "") {
            json(res, 400, { ok: false, error: "标题不能为空" });
            return;
          }
          if (title !== item.title) {
            item.title = title;
            edits.push("标题");
          }
        }
        if (typeof patch.detail === "string") {
          const detail = patch.detail.trim().slice(0, 20000);
          if (detail !== item.detail) {
            item.detail = detail;
            edits.push("说明");
          }
        }
        if (patch.priority !== undefined) {
          const priority = patch.priority === "high" ? "high" : "normal";
          if (priority !== item.priority) {
            item.priority = priority;
            edits.push("紧急程度");
          }
        }
        if (patch.not_before !== undefined) {
          const notBefore = normalizeNotBefore(patch.not_before);
          if (Number.isNaN(notBefore)) {
            json(res, 400, { ok: false, error: "排期不是一个能识别的时间" });
            return;
          }
          const next = notBefore ?? null;
          if (next !== (item.not_before ?? null)) {
            item.not_before = next;
            edits.push("排期");
          }
        }

        if (typeof patch.result === "string") item.result = patch.result.slice(0, 20000);
        if (edits.length > 0) {
          item.events.push({
            at: new Date().toISOString(),
            status: item.status,
            note: `${patch.by === "adelie" ? "Adelie" : "用户"}改了${edits.join("、")}`,
          });
        }
        if (typeof patch.note === "string" && patch.note.trim() !== "") {
          item.events.push({
            at: new Date().toISOString(),
            status: item.status,
            note: patch.note.slice(0, 4000),
          });
        }
        if (Array.isArray(patch.commits)) item.commits = patch.commits.map(String).slice(0, 20);
        if (typeof patch.version === "string") item.version = patch.version.slice(0, 40);
        if (patch.archive === true) item.archived_at = new Date().toISOString();
        item.updated_at = new Date().toISOString();
        save(state);
        console.log(`需求箱更新 ${item.id} -> ${item.status}`);
        json(res, 200, { ok: true, item });
      })
      .catch((err) => json(res, 413, { ok: false, error: err.message }));
    return true;
  }

  json(res, 405, { ok: false, error: "只支持 GET / PATCH" });
  return true;
}

export function initRequirements() {
  ensureDataDir();
  // 口令的指纹：日志里能看出「还是那一把」，但看不出是什么。
  const fingerprint = createHash("sha256").update(readKey()).digest("hex").slice(0, 8);
  const state = load();
  console.log(`需求箱就绪：${DATA_DIR}（${state.items.length} 条，口令指纹 #${fingerprint}）`);
}
