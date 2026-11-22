/**
 * Real-time voice, end to end: the settings routes an admin writes, the status route every
 * signed-in session reads, and the relay the pet's call actually rides.
 *
 * The relay is exercised on the wire rather than around it: a real HTTP listener with
 * `attachRealtimeWebSocket` on it, a real `ws` client standing in for the pet window behind a real
 * session cookie, and a fake provider on loopback that speaks the realtime protocol and records
 * what it received. That is the only way to see the two things that matter here — that the
 * deployment's key is added on the server's hop and never handed to the client, and that frames
 * pass through unchanged in both directions.
 *
 * - The config route is an admin's; a non-admin gets 403 from every verb.
 * - With no rows stored the read reports the built-in site, model and voice, and no key.
 * - A PUT stores what it is given; the key never comes back, only `hasKey`.
 * - A PUT that omits the key (or sends an empty one) keeps the stored key.
 * - A PUT naming an unusable site or a malformed model is refused and writes none of its fields.
 * - The status route is any signed-in session's and reports key presence — and only that.
 * - A handshake with no session cookie, or with no key configured, is refused before any upstream
 *   connection is made.
 * - A live handshake sends ONE `session.update` naming the configured voice and formats before any
 *   audio, relays audio up and provider frames back untouched, and reports a refused upstream
 *   credential to the page as a `proxy.error` frame.
 * - The connectivity check opens the same session and answers ok / the provider's own sentence.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type {
  ErrorBody,
  RealtimeConfigResponse,
  RealtimeStatusResponse,
  RealtimeTestResponse,
} from "../src/api/types.js";
import { SESSION_COOKIE } from "../src/auth/middleware.js";
import { attachRealtimeWebSocket } from "../src/realtime/ws.js";
import {
  DEFAULT_REALTIME_BASE_URL,
  DEFAULT_REALTIME_MODEL,
  DEFAULT_REALTIME_VOICE,
  REALTIME_INSTRUCTIONS,
  probeRealtime,
  realtimeSession,
  realtimeWebSocketUrl,
} from "../src/services/realtime.js";
import { apiClient, createTestApp, loginAdmin, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

/** One frame the fake provider received, as JSON. */
type Frame = Record<string, unknown>;

interface FakeProvider {
  /** The site the server should be pointed at, e.g. `http://127.0.0.1:41234`. */
  url: string;
  seen: {
    /** The Authorization header, or undefined when none was sent. */
    authorization: string | undefined;
    connections: number;
    frames: Frame[];
  };
  close(): Promise<void>;
}

/**
 * A provider that follows the realtime protocol and nothing else: it answers every `session.update`
 * with `session.updated`, and every `input_audio_buffer.append` with one `response.audio.delta`, so
 * a test can watch a frame go up and a frame come back. `refuse` turns the handshake itself into an
 * HTTP answer instead, which is what a refused credential looks like.
 */
async function startFakeProvider(options: { refuse?: number } = {}): Promise<FakeProvider> {
  const seen: FakeProvider["seen"] = { authorization: undefined, connections: 0, frames: [] };
  const http: HttpServer = createServer();
  const wss = new WebSocketServer({ noServer: true });
  http.on("upgrade", (req, socket, head) => {
    if (options.refuse !== undefined) {
      socket.write(
        `HTTP/1.1 ${options.refuse} Refused\r\nContent-Length: 2\r\nConnection: close\r\n\r\nno`,
      );
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      seen.connections += 1;
      if (seen.authorization === undefined) seen.authorization = req.headers.authorization;
      ws.on("message", (data) => {
        const frame = JSON.parse(data.toString()) as Frame;
        seen.frames.push(frame);
        if (frame.type === "session.update") {
          ws.send(JSON.stringify({ type: "session.updated", session: frame.session }));
        } else if (frame.type === "input_audio_buffer.append") {
          ws.send(JSON.stringify({ type: "response.audio.delta", delta: frame.audio }));
        }
      });
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const { port } = http.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close(() => http.close(() => resolve()));
      }),
  };
}

describe("real-time voice settings", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;
  let user: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    t = await createTestApp();
    admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
    user = apiClient(t.app, (await provisionUser(t.app, "norm")).cookie);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it("reads the built-in defaults with no key when nothing is stored", async () => {
    const res = await admin.get("/api/realtime/config");
    expect(res.status).toBe(200);
    expect((await res.json()) as RealtimeConfigResponse).toEqual({
      config: {
        baseUrl: DEFAULT_REALTIME_BASE_URL,
        model: DEFAULT_REALTIME_MODEL,
        voice: DEFAULT_REALTIME_VOICE,
        hasKey: false,
      },
    });
  });

  it("is an admin's, from every verb", async () => {
    for (const call of [
      () => user.get("/api/realtime/config"),
      () => user.put("/api/realtime/config", { voice: "Dylan" }),
      () => user.post("/api/realtime/test", {}),
    ]) {
      const res = await call();
      expect(res.status).toBe(403);
    }
  });

  it("stores what a PUT names, and never hands the key back", async () => {
    const res = await admin.put("/api/realtime/config", {
      baseUrl: "https://example.test",
      model: "qwen3.5-omni-plus-realtime",
      voice: "Dylan",
      apiKey: "sk-secret",
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as RealtimeConfigResponse).toEqual({
      config: {
        baseUrl: "https://example.test",
        model: "qwen3.5-omni-plus-realtime",
        voice: "Dylan",
        hasKey: true,
      },
    });
    expect(t.deps.serverSettingsRepo.getRealtimeSettings().apiKey).toBe("sk-secret");
  });

  it("keeps the stored key when a PUT omits it or sends an empty one", async () => {
    const omitted = await admin.put("/api/realtime/config", { voice: "Serena" });
    expect(((await omitted.json()) as RealtimeConfigResponse).config.hasKey).toBe(true);
    expect(t.deps.serverSettingsRepo.getRealtimeSettings().apiKey).toBe("sk-secret");

    const blank = await admin.put("/api/realtime/config", { apiKey: "" });
    expect(((await blank.json()) as RealtimeConfigResponse).config.hasKey).toBe(true);
    expect(t.deps.serverSettingsRepo.getRealtimeSettings().apiKey).toBe("sk-secret");
  });

  it("refuses an unusable site or a malformed model, and writes none of its fields", async () => {
    const before = t.deps.serverSettingsRepo.getRealtimeSettings();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ baseUrl: "not a url" }, "invalid_realtime_base_url"],
      [{ model: "bad model!" }, "invalid_realtime_model"],
      [{ voice: "" }, "invalid_realtime_voice"],
      // Not a blank key: a blank one means "keep what is stored" (covered above), so the case
      // that belongs here is a value that is not a key at all.
      [{ apiKey: 123 }, "invalid_realtime_api_key"],
    ];
    for (const [body, code] of cases) {
      const res = await admin.put("/api/realtime/config", body);
      expect(res.status, code).toBe(400);
      expect(((await res.json()) as ErrorBody).error.code).toBe(code);
    }
    expect(t.deps.serverSettingsRepo.getRealtimeSettings()).toEqual(before);
  });

  it("reports key presence to any signed-in session", async () => {
    const res = await user.get("/api/realtime/status");
    expect(res.status).toBe(200);
    expect((await res.json()) as RealtimeStatusResponse).toEqual({
      configured: true,
      model: t.deps.serverSettingsRepo.getRealtimeSettings().model,
      voice: t.deps.serverSettingsRepo.getRealtimeSettings().voice,
    });
  });
});

describe("the realtime endpoint and session", () => {
  it("puts the model in the query string and keeps only the site's origin", () => {
    expect(
      realtimeWebSocketUrl("https://dashscope.aliyuncs.com", "qwen3.8-omni-flash-realtime"),
    ).toBe("wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3.8-omni-flash-realtime");
    expect(realtimeWebSocketUrl("http://127.0.0.1:9000", "m")).toBe(
      "ws://127.0.0.1:9000/api-ws/v1/realtime?model=m",
    );
    // An address that carries a path still resolves to the same endpoint.
    expect(realtimeWebSocketUrl("https://gw.test/gateway/v1", "m")).toBe(
      "wss://gw.test/api-ws/v1/realtime?model=m",
    );
  });

  it("names both audio formats, the voice and the interruption in one session", () => {
    const session = realtimeSession("Dylan") as Record<string, unknown>;
    expect(session.voice).toBe("Dylan");
    expect(session.instructions).toBe(REALTIME_INSTRUCTIONS);
    expect(session.input_audio_format).toBe("pcm16");
    expect(session.output_audio_format).toBe("pcm24");
    expect(session.turn_detection).toMatchObject({
      type: "server_vad",
      create_response: true,
      interrupt_response: true,
    });
  });

  it("checks connectivity by opening a session and reports a refused credential", async () => {
    const provider = await startFakeProvider();
    try {
      const probe = await probeRealtime({
        baseUrl: provider.url,
        model: DEFAULT_REALTIME_MODEL,
        voice: "Tina",
        apiKey: "sk-ok",
      });
      expect(probe).toEqual({ ok: true, message: "" });
      expect(provider.seen.authorization).toBe("Bearer sk-ok");
      expect(provider.seen.frames[0]?.type).toBe("session.update");
    } finally {
      await provider.close();
    }

    const refusing = await startFakeProvider({ refuse: 401 });
    try {
      const probe = await probeRealtime({
        baseUrl: refusing.url,
        model: DEFAULT_REALTIME_MODEL,
        voice: "Tina",
        apiKey: "sk-bad",
      });
      expect(probe.ok).toBe(false);
      expect(probe.message).toContain("401");
    } finally {
      await refusing.close();
    }
  });
});

describe("the realtime relay", () => {
  let t: TestApp;
  let cookie = "";
  let relay: HttpServer | null = null;
  let relayUrl = "";
  let provider: FakeProvider | null = null;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = (await loginAdmin(t.app)).cookie;
    const server = createServer();
    attachRealtimeWebSocket(server, {
      settings: t.deps.serverSettingsRepo,
      authService: t.deps.authService,
      log: () => {},
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    relayUrl = `ws://127.0.0.1:${port}/api/realtime`;
    relay = server;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => relay?.close(() => resolve()));
    await t.cleanup();
  });
  afterEach(async () => {
    await provider?.close();
    provider = null;
  });

  /** The session cookie's value alone, which is what a browser would send on the handshake. */
  const sessionToken = (): string => cookie.split("=").slice(1).join("=");

  /** Points the settings at a fake provider that is already listening. */
  const pointAt = (fake: FakeProvider, model = DEFAULT_REALTIME_MODEL): void => {
    t.deps.serverSettingsRepo.setRealtimeSettings({
      baseUrl: fake.url,
      model,
      voice: "Tina",
      apiKey: "sk-deployment",
    });
  };

  /** Opens the relay's handshake the way the pet window would, and resolves with the outcome. */
  const open = (options: { cookie?: string } = {}) =>
    new Promise<{ ws?: WebSocket; refused?: number }>((resolve) => {
      const ws = new WebSocket(relayUrl, {
        headers: { cookie: `${SESSION_COOKIE}=${options.cookie ?? sessionToken()}` },
      });
      ws.on("open", () => resolve({ ws }));
      ws.on("unexpected-response", (_req, res) => resolve({ refused: res.statusCode }));
      ws.on("error", () => resolve({ refused: 0 }));
    });

  it("refuses a handshake with no session cookie", async () => {
    const outcome = await open({ cookie: "not-a-session" });
    expect(outcome.ws).toBeUndefined();
    expect(outcome.refused).toBe(401);
  });

  it("refuses a handshake with no key configured", async () => {
    t.deps.serverSettingsRepo.setRealtimeSettings({
      baseUrl: DEFAULT_REALTIME_BASE_URL,
      model: DEFAULT_REALTIME_MODEL,
      voice: DEFAULT_REALTIME_VOICE,
      apiKey: "",
    });
    const outcome = await open();
    expect(outcome.refused).toBe(503);
  });

  it("sends the session first, relays both ways, and keeps the key server-side", async () => {
    provider = await startFakeProvider();
    pointAt(provider);
    const { ws } = await open();
    expect(ws).toBeDefined();
    const client = ws as WebSocket;

    /** The next frame the page receives, as JSON. */
    const next = () =>
      new Promise<Frame>((resolve) =>
        client.once("message", (data) => resolve(JSON.parse(data.toString()) as Frame)),
      );

    // The server's own session update arrives before anything the page sends, so audio can never
    // overtake the formats it is interpreted in.
    const session = await next();
    expect(session.type).toBe("session.updated");
    expect((session.session as Frame).voice).toBe("Tina");

    client.send(JSON.stringify({ type: "input_audio_buffer.append", audio: "AAAA" }));
    const delta = await next();
    expect(delta).toEqual({ type: "response.audio.delta", delta: "AAAA" });

    // The provider's frame came back unchanged, and the key the deployment stored was added on
    // this hop — the page never sent it and is never told it.
    expect(provider.seen.authorization).toBe("Bearer sk-deployment");
    expect(provider.seen.connections).toBe(1);
    client.close();
  });

  it("hands a refused upstream credential to the page as a proxy error", async () => {
    provider = await startFakeProvider({ refuse: 401 });
    pointAt(provider);
    const { ws } = await open();
    const client = ws as WebSocket;
    const frame = await new Promise<Frame>((resolve) =>
      client.once("message", (data) => resolve(JSON.parse(data.toString()) as Frame)),
    );
    expect(frame.type).toBe("proxy.error");
    expect(String(frame.message)).toContain("401");
    client.close();
  });

  it("runs the settings page's check against the fields it is given", async () => {
    provider = await startFakeProvider();
    try {
      // Nothing stored for the site the check is about: the fields on screen are what is used.
      const res = await apiClient(t.app, cookie).post("/api/realtime/test", {
        baseUrl: provider.url,
        apiKey: "sk-form",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as RealtimeTestResponse;
      expect(body.ok).toBe(true);
      // A check writes nothing, so what it proved does not become the stored configuration.
      expect(t.deps.serverSettingsRepo.getRealtimeSettings().baseUrl).not.toBe(provider.url);
      expect(provider.seen.authorization).toBe("Bearer sk-form");
    } finally {
      await provider.close();
      provider = null;
    }
  });

  it("refuses a check with no key anywhere", async () => {
    t.deps.serverSettingsRepo.setRealtimeSettings({
      baseUrl: DEFAULT_REALTIME_BASE_URL,
      model: DEFAULT_REALTIME_MODEL,
      voice: DEFAULT_REALTIME_VOICE,
      apiKey: "",
    });
    const res = await apiClient(t.app, cookie).post("/api/realtime/test", {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe("realtime_not_configured");
  });
});
