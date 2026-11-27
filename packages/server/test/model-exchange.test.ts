/**
 * The model-exchange ring behind the network panel's model rows (services/model-exchange-log.ts).
 *
 * The rows themselves are drawn from the Session stream's `request_begin`/`request_end`; what this
 * covers is the content — the request Adelie sent and the response it got back — as served by
 * `GET /api/sessions/:id/model-exchanges`: per-Session filtering, the `after` bound that lets the
 * page read one call, the ring's own caps, and the two rules that keep it small (a body is cut at
 * the cap; inline media becomes a placeholder instead of its bytes).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emitModelExchange } from "@adelie/core";
import { adoptSession, fakeSession, uniqueSessionId } from "./fixtures/session.js";
import { createTestApp, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";
import {
  MODEL_EXCHANGE_BODY_CAP,
  resetModelExchangeLogForTests,
} from "../src/services/model-exchange-log.js";
import type { ModelExchangesResponse } from "../src/api/types.js";

function exchange(
  sessionId: string | null,
  startedAt: number,
  overrides: {
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
    status?: string;
  } = {},
): void {
  emitModelExchange({
    sessionId,
    model: "m1",
    clientType: "openai-chat",
    baseUrl: "https://example.invalid/v1",
    startedAt,
    endedAt: startedAt + 1200,
    status: overrides.status ?? "completed",
    errorCode: null,
    errorMessage: null,
    request: {
      systemPrompt: "you are a test",
      tools: null,
      config: { max_tokens: 100 },
      messages: [{ role: "user", content: "hi" }],
      ...overrides.request,
    },
    response: { text: "hello", thinking: "", toolCalls: [], ...overrides.response },
  });
}

describe("model exchange records", () => {
  let t: TestApp;
  let cookie: string;
  let SID: string;

  const get = (query = "") =>
    t.app.request(`/api/sessions/${SID}/model-exchanges${query}`, { headers: { cookie } });

  beforeAll(async () => {
    t = await createTestApp();
    ({ cookie } = await provisionUser(t.app, "exchanger"));
  });
  afterAll(async () => {
    await t.cleanup();
  });
  beforeEach(() => {
    resetModelExchangeLogForTests();
    SID = uniqueSessionId();
    adoptSession(t.deps, fakeSession(SID), { projectId: "exchanger-default_project" });
  });

  it("serves only this Session's calls, oldest first", async () => {
    const other = uniqueSessionId();
    adoptSession(t.deps, fakeSession(other), { projectId: "exchanger-default_project" });
    exchange(SID, 1000);
    exchange(other, 1100);
    exchange(SID, 1200);

    const body = (await (await get()).json()) as ModelExchangesResponse;
    expect(body.exchanges).toHaveLength(2);
    expect(body.exchanges.map((e) => e.startedAt)).toEqual([1000, 1200]);
    expect(body.exchanges[0]!.requestJson).toContain("you are a test");
    expect(body.exchanges[0]!.responseJson).toContain("hello");
    expect(body.exchanges[0]!.status).toBe("completed");
    expect(body.exchanges[0]!.clientType).toBe("openai-chat");
  });

  it("uses `after` to read only what a page has not seen", async () => {
    exchange(SID, 1000);
    exchange(SID, 2000);
    exchange(SID, 3000);
    const body = (await (await get("?after=1500")).json()) as ModelExchangesResponse;
    expect(body.exchanges.map((e) => e.startedAt)).toEqual([2000, 3000]);
  });

  it("caps a body and says it did", async () => {
    exchange(SID, 1000, {
      request: { messages: [{ role: "user", content: "x".repeat(500_000) }] },
    });
    const body = (await (await get()).json()) as ModelExchangesResponse;
    const entry = body.exchanges[0]!;
    expect(entry.requestJson.length).toBe(MODEL_EXCHANGE_BODY_CAP);
    expect(entry.requestTruncated).toBe(true);
    expect(entry.responseTruncated).toBe(false);
  });

  it("stores inline media as a placeholder, not as its bytes", async () => {
    const image = `data:image/png;base64,${"A".repeat(120_000)}`;
    exchange(SID, 1000, {
      request: { messages: [{ role: "user", content: [image, "look at this"] }] },
    });
    const body = (await (await get()).json()) as ModelExchangesResponse;
    const entry = body.exchanges[0]!;
    expect(entry.requestJson).toContain("data:image/png;base64,<");
    expect(entry.requestJson).not.toContain("A".repeat(5000));
    expect(entry.requestTruncated).toBe(false);
    expect(entry.requestJson).toContain("look at this");
  });

  it("refuses an unauthenticated read", async () => {
    const res = await t.app.request(`/api/sessions/${SID}/model-exchanges`);
    expect(res.status).toBe(401);
  });
});
