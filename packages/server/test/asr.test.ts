/**
 * Speech input, end to end through the real HTTP app: the composer's recording goes up to
 * /api/asr/transcribe, the server makes ONE WebSocket call to the configured provider and
 * answers with the transcript.
 *
 * The upstream is a fake `ws` server on a loopback port, so the cases below drive the real
 * protocol rather than a stand-in for it: what the server sends (the Authorization header,
 * the `run-task` frame's model and audio parameters, the audio frames, `finish-task`) and
 * what it does with each frame that comes back are all observed on the wire.
 *
 * - The config route is an admin's; a non-admin gets 403 from both verbs and writes nothing.
 * - With no rows stored the read reports the built-in site and model, and no key.
 * - A PUT stores the site, the model and the key; the key never comes back, only `hasKey`.
 * - A PUT that omits the key (or sends an empty one) keeps the stored key.
 * - A PUT naming an unusable site is refused and writes none of its fields.
 * - Transcribing with no key configured is refused before any socket is opened.
 * - Transcribing with one reaches the configured site and returns the provider's sentence
 *   frames joined in arrival order; an empty transcript is a 200, not an error.
 * - A `task-failed` frame is a 502 carrying the provider's own words; a site that refuses the
 *   connection is a 502 named `asr_unreachable`, not a refusal by the provider.
 * - An empty, non-PCM or over-long body is refused with its own code.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import type { Server as HttpServer } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AsrConfig, AsrConfigResponse, AsrTranscribeResponse } from "../src/api/types.js";
import {
  ASR_MAX_BYTES,
  DEFAULT_ASR_BASE_URL,
  DEFAULT_ASR_MODEL,
  asrWebSocketUrl,
  parseAsrEvent,
  transcriptOf,
} from "../src/services/asr.js";
import { apiClient, createTestApp, loginAdmin, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

/** One `run-task` frame as the fake upstream received it. */
interface ReceivedRunTask {
  header: { action: string };
  payload: {
    task_group: string;
    task: string;
    function: string;
    model: string;
    parameters: { format: string; sample_rate: number };
  };
}

interface FakeUpstream {
  /** The site the server should be pointed at, e.g. `http://127.0.0.1:41234`. */
  url: string;
  /** What the server sent, as the upstream saw it. */
  seen: {
    authorization: string | undefined;
    connections: number;
    runTask: ReceivedRunTask | null;
    audio: Buffer;
    finished: boolean;
  };
  close(): Promise<void>;
}

/**
 * A provider that follows the streaming protocol and nothing else: it answers `run-task`
 * with either `task-started` or the failure the case asked for, collects the audio frames,
 * and on `finish-task` emits the sentences and ends the task.
 */
async function startFakeUpstream(
  options: { sentences?: string[]; fail?: { code: string; message: string } } = {},
): Promise<FakeUpstream> {
  const seen: FakeUpstream["seen"] = {
    authorization: undefined,
    connections: 0,
    runTask: null,
    audio: Buffer.alloc(0),
    finished: false,
  };
  const http: HttpServer = createServer();
  const wss = new WebSocketServer({ server: http });
  wss.on("connection", (socket, req) => {
    seen.connections += 1;
    if (seen.authorization === undefined) seen.authorization = req.headers.authorization;
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        seen.audio = Buffer.concat([seen.audio, Buffer.from(data as Buffer)]);
        return;
      }
      const frame = JSON.parse(data.toString()) as { header?: { action?: string } };
      if (frame.header?.action === "run-task") {
        seen.runTask = frame as unknown as ReceivedRunTask;
        if (options.fail !== undefined) {
          socket.send(
            JSON.stringify({
              header: {
                event: "task-failed",
                error_code: options.fail.code,
                error_message: options.fail.message,
              },
              payload: {},
            }),
          );
          return;
        }
        socket.send(JSON.stringify({ header: { event: "task-started" }, payload: {} }));
        return;
      }
      if (frame.header?.action === "finish-task") {
        seen.finished = true;
        for (const text of options.sentences ?? ["你好"]) {
          socket.send(
            JSON.stringify({
              header: { event: "result-generated" },
              payload: { output: { sentence: { text, sentence_end: true } } },
            }),
          );
        }
        socket.send(JSON.stringify({ header: { event: "task-finished" }, payload: {} }));
      }
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

/** 100 ms of silence at 16 kHz mono PCM16 — a body the route accepts. */
const ONE_FRAME = new Uint8Array(3200);

describe("speech input", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;
  let user: ReturnType<typeof apiClient>;
  let adminCookie = "";
  let userCookie = "";
  let upstream: FakeUpstream | null = null;

  beforeAll(async () => {
    t = await createTestApp();
    adminCookie = (await loginAdmin(t.app)).cookie;
    userCookie = (await provisionUser(t.app, "norm")).cookie;
    admin = apiClient(t.app, adminCookie);
    user = apiClient(t.app, userCookie);
  });
  afterAll(async () => {
    await t.cleanup();
  });
  beforeEach(() => {
    t.deps.db.exec("DELETE FROM server_settings");
  });
  afterEach(async () => {
    await upstream?.close();
    upstream = null;
  });

  const getConfig = async (client = admin): Promise<AsrConfig> => {
    const res = await client.get("/api/asr/config");
    expect(res.status).toBe(200);
    return ((await res.json()) as AsrConfigResponse).config;
  };
  const putConfig = (body: unknown, client = admin) => client.put("/api/asr/config", body);
  const errorCode = async (res: Response) =>
    ((await res.json()) as { error: { code: string; message: string } }).error;

  /** Transcribe as one of the two accounts — the utterance rides base64 in the JSON body. */
  const transcribe = async (
    who: "admin" | "user",
    pcm: Uint8Array = ONE_FRAME,
    sampleRate?: number,
  ): Promise<Response> =>
    t.app.request("/api/asr/transcribe", {
      method: "POST",
      headers: {
        cookie: who === "admin" ? adminCookie : userCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        dataBase64: Buffer.from(pcm).toString("base64"),
        ...(sampleRate !== undefined ? { sampleRate } : {}),
      }),
    });

  it("keeps the config route to admins, and writes nothing for anyone else", async () => {
    expect((await user.get("/api/asr/config")).status).toBe(403);
    expect((await putConfig({ model: "x" }, user)).status).toBe(403);
    expect(t.deps.db.prepare("SELECT count(*) AS n FROM server_settings").get()).toEqual({ n: 0 });
  });

  it("reads the built-in site and model, and no key, before anything is stored", async () => {
    expect(await getConfig()).toEqual({
      baseUrl: DEFAULT_ASR_BASE_URL,
      model: DEFAULT_ASR_MODEL,
      hasKey: false,
    });
  });

  it("stores the site, the model and the key, and never hands the key back", async () => {
    const res = await putConfig({
      baseUrl: "https://example.test",
      model: "qwen-audio-3.1-asr-flash-streaming",
      apiKey: "sk-test-key",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as AsrConfigResponse).config).toEqual({
      baseUrl: "https://example.test",
      model: "qwen-audio-3.1-asr-flash-streaming",
      hasKey: true,
    });
    // The read is the same masked view, and the stored key is what the route would send.
    expect(await getConfig()).toEqual({
      baseUrl: "https://example.test",
      model: "qwen-audio-3.1-asr-flash-streaming",
      hasKey: true,
    });
    expect(JSON.stringify(await getConfig())).not.toContain("sk-test-key");
  });

  it("keeps the stored key when a PUT omits it or sends an empty one", async () => {
    await putConfig({ baseUrl: "https://example.test", model: "m", apiKey: "sk-keep-me" });
    expect((await putConfig({ model: "other" })).status).toBe(200);
    expect(await getConfig()).toMatchObject({ model: "other", hasKey: true });
    expect((await putConfig({ apiKey: "" })).status).toBe(200);
    expect(await getConfig()).toMatchObject({ hasKey: true });
  });

  it("refuses an unusable site and writes none of the PUT's fields", async () => {
    await putConfig({ baseUrl: "https://example.test", model: "keep", apiKey: "sk-keep-me" });
    const res = await putConfig({ baseUrl: "not a url", model: "changed" });
    expect(res.status).toBe(400);
    expect((await errorCode(res)).code).toBe("invalid_asr_base_url");
    expect(await getConfig()).toEqual({
      baseUrl: "https://example.test",
      model: "keep",
      hasKey: true,
    });
  });

  it("refuses to transcribe before any key is configured, without opening a socket", async () => {
    const res = await transcribe("admin");
    expect(res.status).toBe(400);
    expect((await errorCode(res)).code).toBe("asr_not_configured");
  });

  it("transcribes through the configured site and returns the provider's sentences", async () => {
    upstream = await startFakeUpstream({ sentences: ["你好，", "世界。"] });
    await putConfig({ baseUrl: upstream.url, model: "my-model", apiKey: "sk-test-key" });

    const res = await transcribe("admin");
    expect(res.status).toBe(200);
    expect(((await res.json()) as AsrTranscribeResponse).text).toBe("你好，世界。");

    // What the provider actually received, not what the route logged.
    expect(upstream.seen.authorization).toBe("Bearer sk-test-key");
    expect(upstream.seen.runTask?.header.action).toBe("run-task");
    expect(upstream.seen.runTask?.payload).toMatchObject({
      task_group: "audio",
      task: "asr",
      function: "recognition",
      model: "my-model",
      parameters: { format: "pcm", sample_rate: 16000 },
    });
    expect(upstream.seen.audio.length).toBe(ONE_FRAME.length);
    expect(upstream.seen.finished).toBe(true);
  });

  it("lets any signed-in user transpose the admin's key, and returns an empty transcript", async () => {
    upstream = await startFakeUpstream({ sentences: [] });
    await putConfig({ baseUrl: upstream.url, model: "m", apiKey: "sk-test-key" });
    const res = await transcribe("user");
    expect(res.status).toBe(200);
    expect(((await res.json()) as AsrTranscribeResponse).text).toBe("");
  });

  it("reports a provider refusal as a 502 carrying the provider's own words", async () => {
    upstream = await startFakeUpstream({
      fail: { code: "unauthorized", message: "API 密钥不存在" },
    });
    await putConfig({ baseUrl: upstream.url, model: "m", apiKey: "sk-nope" });
    const res = await transcribe("admin");
    expect(res.status).toBe(502);
    const err = await errorCode(res);
    expect(err.code).toBe("asr_upstream");
    expect(err.message).toContain("API 密钥不存在");
  });

  it("names a site that refuses the connection as unreachable, not as a refusal", async () => {
    // Port 1 on loopback: nothing listens, so the handshake never completes.
    await putConfig({ baseUrl: "http://127.0.0.1:1", model: "m", apiKey: "sk-test-key" });
    const res = await transcribe("admin");
    expect(res.status).toBe(502);
    expect((await errorCode(res)).code).toBe("asr_unreachable");
  });

  it("refuses an empty, odd-length or over-long recording with its own code", async () => {
    upstream = await startFakeUpstream({ sentences: [] });
    await putConfig({ baseUrl: upstream.url, model: "m", apiKey: "sk-test-key" });

    const empty = await transcribe("admin", new Uint8Array(0));
    expect(empty.status).toBe(400);
    expect((await errorCode(empty)).code).toBe("asr_empty_audio");

    const odd = await transcribe("admin", new Uint8Array(3));
    expect(odd.status).toBe(400);
    expect((await errorCode(odd)).code).toBe("asr_bad_audio");

    const long = await transcribe("admin", new Uint8Array(ASR_MAX_BYTES + 2));
    expect(long.status).toBe(413);
    expect((await errorCode(long)).code).toBe("asr_too_long");
    // Nothing was sent upstream for any of them.
    expect(upstream.seen.connections).toBe(0);
  });

  it("refuses a sample rate the protocol does not take", async () => {
    upstream = await startFakeUpstream({ sentences: [] });
    await putConfig({ baseUrl: upstream.url, model: "m", apiKey: "sk-test-key" });
    const res = await transcribe("admin", ONE_FRAME, 44100);
    expect(res.status).toBe(400);
    expect((await errorCode(res)).code).toBe("asr_bad_sample_rate");
  });

  it("accepts the documented sample rate explicitly", async () => {
    upstream = await startFakeUpstream({ sentences: ["好"] });
    await putConfig({ baseUrl: upstream.url, model: "m", apiKey: "sk-test-key" });
    const res = await transcribe("admin", ONE_FRAME, 16000);
    expect(res.status).toBe(200);
    expect(upstream.seen.runTask?.payload.parameters.sample_rate).toBe(16000);
  });

  // The two pure helpers the route and the flow above rest on.
  it("derives the endpoint from the site's origin, however the site was spelled", () => {
    expect(asrWebSocketUrl("")).toBe(`wss://tokendance.space/gateway/alibaba/api-ws/v1/inference`);
    expect(asrWebSocketUrl("https://tokendance.space")).toBe(
      "wss://tokendance.space/gateway/alibaba/api-ws/v1/inference",
    );
    // A gateway's own `/v1` path must not end up in front of the protocol's path.
    expect(asrWebSocketUrl("https://tokendance.space/gateway/v1")).toBe(
      "wss://tokendance.space/gateway/alibaba/api-ws/v1/inference",
    );
    expect(asrWebSocketUrl("http://127.0.0.1:9000")).toBe(
      "ws://127.0.0.1:9000/gateway/alibaba/api-ws/v1/inference",
    );
  });

  it("reads the protocol's frames and ignores anything else", () => {
    expect(parseAsrEvent(JSON.stringify({ header: { event: "task-started" } }))).toEqual({
      kind: "started",
    });
    expect(parseAsrEvent(JSON.stringify({ header: { event: "task-finished" } }))).toEqual({
      kind: "finished",
    });
    expect(
      parseAsrEvent(
        JSON.stringify({
          header: { event: "result-generated" },
          payload: { output: { sentence: { text: "句一", sentence_end: true } } },
        }),
      ),
    ).toEqual({ kind: "sentence", text: "句一" });
    expect(
      parseAsrEvent(
        JSON.stringify({
          header: { event: "task-failed", error_code: "unauthorized", error_message: "no" },
        }),
      ),
    ).toEqual({ kind: "failed", code: "unauthorized", message: "no" });
    expect(parseAsrEvent("not json")).toBeNull();
    expect(parseAsrEvent(JSON.stringify({ header: { event: "something-new" } }))).toBeNull();
    expect(parseAsrEvent(JSON.stringify({ payload: {} }))).toBeNull();
    expect(
      transcriptOf([
        { kind: "started" },
        { kind: "sentence", text: "甲" },
        { kind: "sentence", text: "乙" },
        { kind: "finished" },
      ]),
    ).toBe("甲乙");
  });
});
