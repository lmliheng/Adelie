/**
 * The Adelie side of the kit, in one place: where Adelie keeps its data, where the bridge
 * keeps its own files, and a small HTTP client that finds a running Adelie and talks to it.
 *
 * It lives apart from `serve.mjs` because two callers need it — the long-running bridge, and
 * the one-shot `install.mjs` / `uninstall.mjs` that write the agent's config — and a second
 * copy of the discovery ladder would be a second thing to get wrong.
 *
 * Everything is local: the origin is this machine's Adelie, the token is the one Adelie writes
 * into its data root, and no request leaves the loopback interface.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Adelie's data root: the same precedence the CLI and the desktop shell use. */
export function resolveDataRoot(env = process.env) {
  return env.ADELIE_HOME ?? env.PENGUIN_HOME ?? path.join(os.homedir(), ".adelie", "data");
}

/** Where the bridge keeps its config and state — under Adelie's root, never inside the plugin. */
export function bridgeDir(root) {
  return path.join(root, "wps-bridge");
}

/**
 * The bridge's settings, and the file they are read from (`<root>/wps-bridge/config.json`).
 * They live here rather than in `serve.mjs` so the installer can resolve the same effective
 * port and MCP URL the bridge will use, without a second copy of the numbers to drift.
 */
export const DEFAULT_CONFIG = {
  /** The bridge's own port. Fixed by default so the WPS add-on's URL stays valid. */
  port: 3891,
  host: "127.0.0.1",
  /** Adelie's origin; null = discover it (desktop port file, then the usual dev ports). */
  adelieUrl: null,
  /** Session target: the first Project unless set; the Agent that owns the WPS conversation. */
  projectId: null,
  agentId: "default_agent",
  /** Panel sessions start here: reads run freely, document writes ask the person (rw -> approval). */
  approvalMode: "read-only",
  /** Register the MCP tools in the Agent's config during install. */
  installMcp: true,
  /** How long a document command may stay unanswered before the agent's turn gets an error. */
  commandTimeoutMs: 30_000,
};

/** The name the bridge's tools get in Adelie: `mcp__wps__read_document`. */
export const MCP_SERVER_NAME = "wps";

export function readJsonFile(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return { ...fallback };
  }
}

export function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/* ------------------------------------------------------------------------- Adelie ------- */

/** Where the desktop shell announces the port of the server it started. */
function portFileCandidates() {
  const names = ["Adelie", "Adelie-Dev", "adelie"];
  const bases = [];
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    for (const n of names) bases.push(path.join(appData, n));
  } else if (process.platform === "darwin") {
    for (const n of names) bases.push(path.join(os.homedir(), "Library", "Application Support", n));
  } else {
    const configHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
    for (const n of names) bases.push(path.join(configHome, n));
  }
  return bases.map((b) => path.join(b, "server-port"));
}

function readPortFile(file) {
  try {
    const m = /^(\d{1,5})\s*/.exec(fs.readFileSync(file, "utf8"));
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** Whether something at this origin answers Adelie's public install probe. */
async function isAdelie(origin) {
  try {
    const res = await fetch(`${origin}/api/install`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const body = await res.json();
    return typeof body?.installId === "string";
  } catch {
    return false;
  }
}

/**
 * Find Adelie: an explicit setting first, then the desktop shell's port announcement, then
 * the ports a CLI-run server uses. Nothing here is cached beyond the call — a restarted
 * Adelie picks a new port, and the bridge must follow it.
 */
export async function discoverAdelie(config) {
  if (config.adelieUrl !== null && config.adelieUrl !== undefined) {
    const origin = String(config.adelieUrl).replace(/\/$/, "");
    if (await isAdelie(origin)) return { origin, source: "config" };
  }
  for (const file of portFileCandidates()) {
    const port = readPortFile(file);
    if (port === null) continue;
    const origin = `http://localhost:${port}`;
    if (await isAdelie(origin)) return { origin, source: `port-file:${file}` };
  }
  for (const port of [7364, 4000, 7370]) {
    const origin = `http://localhost:${port}`;
    if (await isAdelie(origin)) return { origin, source: `probe:${port}` };
  }
  return { origin: null, source: "not-found" };
}

/** The local API token Adelie writes on every start — re-read per request, it rotates. */
export function readToken(root) {
  try {
    return fs.readFileSync(path.join(root, "api-token"), "utf8").trim();
  } catch {
    return null;
  }
}

/**
 * Adelie's HTTP client: origin discovery, the rotating local token as a Bearer header, one
 * retry after re-reading the token (the token changes on every Adelie restart, and a bridge
 * outlives those).
 */
export class Adelie {
  constructor(root, config, log = () => {}) {
    this.root = root;
    this.config = config;
    this.log = log;
    this.origin = null;
  }

  async ensure() {
    const { origin, source } = await discoverAdelie(this.config);
    if (origin !== null) this.origin = origin;
    return { origin: this.origin, source };
  }

  async fetch(pathname, init = {}) {
    if (this.origin === null) await this.ensure();
    if (this.origin === null) {
      throw new Error(
        "找不到正在运行的 Adelie。请先打开 Adelie 桌面应用（或启动服务端），再重试。",
      );
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = readToken(this.root);
      const headers = {
        ...(init.headers ?? {}),
        ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      };
      const res = await fetch(`${this.origin}${pathname}`, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(120_000),
      });
      if (res.status === 401 && attempt === 0) continue;
      return res;
    }
    throw new Error("Adelie 拒绝了这个请求（401）：本机 API 令牌读不到或已失效。");
  }

  async json(pathname, init) {
    const res = await this.fetch(pathname, init);
    const text = await res.text();
    let body = null;
    try {
      body = text === "" ? null : JSON.parse(text);
    } catch {
      body = text;
    }
    if (!res.ok) {
      // A 401 has one cause worth naming: the local token is missing or rotated. Adelie's own
      // wording ("Not signed in or the sign-in has expired") sends the person looking for a
      // sign-in that does not exist on a loopback API.
      if (res.status === 401) {
        throw new Error(
          "Adelie 不认这个请求的本机令牌（401）。令牌每次启动 Adelie 都会重发，读不到就说明数据根不对或 Adelie 刚重启过；重新跑一次安装脚本即可。",
        );
      }
      const message =
        (body !== null && typeof body === "object" && body.error?.message) ||
        (typeof body === "string" && body.slice(0, 300)) ||
        `HTTP ${res.status}`;
      throw new Error(message);
    }
    return body;
  }

  /** The Project this kit works in: the configured one, else the first Adelie lists. */
  async projectId() {
    if (this.config.projectId !== null && this.config.projectId !== undefined) {
      return this.config.projectId;
    }
    const body = await this.json("/api/projects");
    const first = body?.projects?.[0]?.projectId;
    if (typeof first !== "string") throw new Error("Adelie 里还没有 Project。");
    return first;
  }

  async createSession({ workspace } = {}) {
    const projectId = await this.projectId();
    const agentId = this.config.agentId;
    const body = await this.json(
      `/api/projects/${encodeURIComponent(projectId)}/agents/${encodeURIComponent(agentId)}/sessions`,
      {
        method: "POST",
        body: JSON.stringify({
          approvalMode: this.config.approvalMode,
          ...(workspace !== undefined && fs.existsSync(workspace) ? { workspace } : {}),
        }),
      },
    );
    const sessionId = body?.session?.sessionId;
    if (typeof sessionId !== "string") throw new Error("Adelie 没有返回 sessionId。");
    return { sessionId, projectId, agentId };
  }

  messages(sessionId, limit) {
    const qs = limit === undefined ? "" : `?tailLimit=${limit}`;
    return this.json(`/api/sessions/${encodeURIComponent(sessionId)}/messages${qs}`);
  }

  task(sessionId, text) {
    return this.json(`/api/sessions/${encodeURIComponent(sessionId)}/tasks`, {
      method: "POST",
      body: JSON.stringify({ input: [{ type: "text", text }], queueIfBusy: true }),
    });
  }

  approve(sessionId, toolCallId, decision) {
    return this.json(
      `/api/sessions/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(toolCallId)}`,
      { method: "POST", body: JSON.stringify({ decision }) },
    );
  }

  abort(sessionId) {
    return this.json(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, { method: "POST" });
  }

  /* --- the agent's own configuration: the bridge's tools are registered here ----------------- */

  /** The agent's config view (`{ config, agentsMd, … }`). */
  agentConfig() {
    return this.projectId().then((projectId) =>
      this.json(
        `/api/projects/${encodeURIComponent(projectId)}/agents/${encodeURIComponent(this.config.agentId)}/config`,
      ),
    );
  }

  /**
   * Write the agent's config. The server merges per key, so sending one key alone is safe —
   * but only the keys it knows (`mcpServers`, `toolsBuiltin`, …); anything else is answered
   * with a 200 and dropped, which is why the MCP entry is `mcpServers` and not `tools`.
   */
  async updateAgentConfig(config) {
    const projectId = await this.projectId();
    return this.json(
      `/api/projects/${encodeURIComponent(projectId)}/agents/${encodeURIComponent(this.config.agentId)}/config`,
      { method: "PUT", body: JSON.stringify({ config }) },
    );
  }

  /** Ask Adelie to connect to one MCP entry and list its tools — the install's own check. */
  async mcpTest(name, config) {
    const projectId = await this.projectId();
    return this.json(
      `/api/projects/${encodeURIComponent(projectId)}/agents/${encodeURIComponent(this.config.agentId)}/config/mcp-test`,
      { method: "POST", body: JSON.stringify({ name, config }) },
    );
  }
}
