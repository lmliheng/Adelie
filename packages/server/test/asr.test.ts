/**
 * Speech input, end to end through the real HTTP app: the composer's recording goes up to
 * /api/asr/transcribe, the server makes ONE WebSocket call to the configured service and
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
 * - A sentence the provider revises is counted once, not once per revision.
 * - A `task-failed` frame is a 502 carrying the provider's own words; a site that refuses the
 *   connection is a 502 named `asr_unreachable`, not a refusal by the provider. A handshake that
 *   never completes is explained by asking the same address once over HTTP, so a refused
 *   credential (401) is named as such and any other answer is reported with its status.
 * - The connectivity check (POST /api/asr/test) runs the same task against the fields the form
 *   holds — stored ones when it omits them — and writes none of them; a service that refuses or
 *   cannot be reached comes back 200 with `ok: false` and the sentence explaining why, while a
 *   field it cannot resolve, or no key anywhere, is a 400.
 * - An empty, non-PCM or over-long body is refused with its own code.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import type { Server as HttpServer } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  AsrConfig,
  AsrConfigResponse,
  AsrTestResponse,
  AsrTranscribeResponse,
} from "../src/api/types.js";
import {
  ASR_MAX_BYTES,
  BAILIAN_WS_PATH,
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
 * and on `finish-task` emits the sentences and ends the task. A sentence may be given as a
 * bare string (one finished sentence) or as the frame object itself, which is how the
 * revision cases say what they mean.
 */
type FakeSentence = string | Record<string, unknown>;

async function startFakeUpstream(
  options: { sentences?: FakeSentence[]; fail?: { code: string; message: string } } = {},
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
        for (const sentence of options.sentences ?? ["你好"]) {
          socket.send(
            JSON.stringify({
              header: { event: "result-generated" },
              payload: {
                output: {
                  sentence:
                    typeof sentence === "string"
                      ? { text: sentence, sentence_end: true }
                      : sentence,
                },
              },
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

/**
 * A site that answers every request with one HTTP status and never upgrades: what a service looks
 * like when the credential is wrong, and what the diagnostic behind a failed handshake asks. The
 * WebSocket layer reports this the same way it reports a host that does not exist, so the HTTP
 * answer is the only thing that tells the two apart.
 */
async function startHttpRefuser(status: number): Promise<{ url: string; close(): Promise<void> }> {
  const http: HttpServer = createServer((_req, res) => {
    res.writeHead(status, { "content-type": "text/plain" });
    res.end("no");
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const { port } = http.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => http.close(() => resolve())),
  };
}

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
  const testConfig = (body: unknown, client = admin) => client.post("/api/asr/test", body);
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

  it("names a refused credential as such, rather than blaming the network", async () => {
    const refusing = await startHttpRefuser(401);
    await putConfig({ baseUrl: refusing.url, model: "m", apiKey: "sk-wrong" });

    const res = await transcribe("admin");
    expect(res.status).toBe(502);
    const err = await errorCode(res);
    expect(err.code).toBe("asr_credential_refused");
    expect(err.message).toContain("401");
    await refusing.close();
  });

  it("reports a site that answers the upgrade with something else, status and all", async () => {
    const plain = await startHttpRefuser(200);
    await putConfig({ baseUrl: plain.url, model: "m", apiKey: "sk-test-key" });

    const res = await transcribe("admin");
    expect(res.status).toBe(502);
    const err = await errorCode(res);
    expect(err.code).toBe("asr_unreachable");
    expect(err.message).toContain("HTTP 200");
    await plain.close();
  });

  it("checks the fields the form holds, before they are saved, and writes none of them", async () => {
    upstream = await startFakeUpstream({ sentences: [] });
    const res = await testConfig({
      baseUrl: upstream.url,
      model: "draft-model",
      apiKey: "sk-draft",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AsrTestResponse;
    expect(body.ok).toBe(true);
    expect(body.message).toBe("");
    // The endpoint reported says which of the two sites this address resolved to.
    expect(body.endpoint).toBe(
      `${upstream.url.replace(/^http/, "ws")}/gateway/alibaba/api-ws/v1/inference`,
    );
    // The form's fields reached the provider, as a whole task from run-task to finish-task…
    expect(upstream.seen.authorization).toBe("Bearer sk-draft");
    expect(upstream.seen.runTask?.payload.model).toBe("draft-model");
    expect(upstream.seen.finished).toBe(true);
    // …and none of them were stored.
    expect(await getConfig()).toEqual({
      baseUrl: DEFAULT_ASR_BASE_URL,
      model: DEFAULT_ASR_MODEL,
      hasKey: false,
    });
  });

  it("falls back to the stored site, model and key when the check omits them", async () => {
    upstream = await startFakeUpstream({ sentences: [] });
    await putConfig({ baseUrl: upstream.url, model: "stored-model", apiKey: "sk-stored" });

    const res = await testConfig({});
    expect(res.status).toBe(200);
    expect(((await res.json()) as AsrTestResponse).ok).toBe(true);
    expect(upstream.seen.authorization).toBe("Bearer sk-stored");
    expect(upstream.seen.runTask?.payload.model).toBe("stored-model");
  });

  it("answers a refusing service as not ok, in the service's own words, and a dead one by name", async () => {
    upstream = await startFakeUpstream({
      fail: {
        code: "Arrearage",
        message: "Access denied, please make sure your account is in good standing.",
      },
    });
    const refused = await testConfig({ baseUrl: upstream.url, model: "m", apiKey: "sk-x" });
    // 200: the check ran. What it found is the body.
    expect(refused.status).toBe(200);
    const body = (await refused.json()) as AsrTestResponse;
    expect(body.ok).toBe(false);
    expect(body.message).toContain("in good standing");
    await upstream.close();
    upstream = null;

    // Nothing listening: the check names the transport rather than inventing a refusal.
    const dead = await testConfig({ baseUrl: "http://127.0.0.1:1", model: "m", apiKey: "sk-x" });
    expect(dead.status).toBe(200);
    const deadBody = (await dead.json()) as AsrTestResponse;
    expect(deadBody.ok).toBe(false);
    expect(deadBody.message).toContain("Could not reach");
  });

  it("refuses a check it cannot resolve, and one with no key anywhere, without opening a socket", async () => {
    const bad = await testConfig({ baseUrl: "not a url", apiKey: "sk-x" });
    expect(bad.status).toBe(400);
    expect((await errorCode(bad)).code).toBe("invalid_asr_base_url");

    const keyless = await testConfig({});
    expect(keyless.status).toBe(400);
    expect((await errorCode(keyless)).code).toBe("asr_not_configured");
  });

  it("tells a wrong key from a site that is not there in the check too", async () => {
    const refusing = await startHttpRefuser(401);
    const res = await testConfig({ baseUrl: refusing.url, model: "m", apiKey: "sk-wrong" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AsrTestResponse;
    expect(body.ok).toBe(false);
    expect(body.message).toContain("401");
    await refusing.close();
  });

  it("keeps the connectivity check to admins", async () => {
    expect((await testConfig({}, user)).status).toBe(403);
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

  it("counts a sentence the provider revises once, not once per revision", async () => {
    // The shape the service really sends: the same sentence_id again and again with more of it
    // as the words are recognized, and `sentence_end` on the last of them.
    upstream = await startFakeUpstream({
      sentences: [
        { sentence_id: 1, text: "你好", sentence_end: false },
        { sentence_id: 1, text: "你好，世界", sentence_end: false },
        { sentence_id: 1, text: "你好，世界。", sentence_end: true },
        { sentence_id: 2, text: "再见。" },
      ],
    });
    await putConfig({ baseUrl: upstream.url, model: "m", apiKey: "sk-test-key" });

    const res = await transcribe("admin");
    expect(res.status).toBe(200);
    expect(((await res.json()) as AsrTranscribeResponse).text).toBe("你好，世界。再见。");
  });

  it("counts a finished sentence that names no sentence_id, and ignores an unfinished one", async () => {
    // The gateway's own example prints only the frames marked `sentence_end`; a half-sentence
    // with no id has nothing to replace, so it is a revision of something already counted.
    upstream = await startFakeUpstream({
      sentences: [
        { text: "你好" },
        { text: "你好，世界。", sentence_end: true },
        { text: "你好，世界。再见。", sentence_end: true },
      ],
    });
    await putConfig({ baseUrl: upstream.url, model: "m", apiKey: "sk-test-key" });

    const res = await transcribe("admin");
    expect(res.status).toBe(200);
    expect(((await res.json()) as AsrTranscribeResponse).text).toBe(
      "你好，世界。你好，世界。再见。",
    );
  });

  // The pure helpers the route and the flows above rest on.
  it("picks the endpoint from the site's origin, however it was spelled", () => {
    expect(asrWebSocketUrl("")).toBe("wss://tokendance.space/gateway/alibaba/api-ws/v1/inference");
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
    // Alibaba's own site, public and international alike, serves the models one path shorter.
    expect(asrWebSocketUrl("https://dashscope.aliyuncs.com")).toBe(
      `wss://dashscope.aliyuncs.com${BAILIAN_WS_PATH}`,
    );
    expect(asrWebSocketUrl("https://dashscope-intl.aliyuncs.com/api/v1")).toBe(
      `wss://dashscope-intl.aliyuncs.com${BAILIAN_WS_PATH}`,
    );
    // A name that merely ends in the same letters is not that site.
    expect(asrWebSocketUrl("https://aliyuncs.com.example.test")).toBe(
      "wss://aliyuncs.com.example.test/gateway/alibaba/api-ws/v1/inference",
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
    ).toEqual({ kind: "sentence", id: null, text: "句一", final: true });
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
        { kind: "sentence", id: null, text: "甲", final: true },
        { kind: "sentence", id: null, text: "乙", final: true },
        { kind: "finished" },
      ]),
    ).toBe("甲乙");
  });
});
