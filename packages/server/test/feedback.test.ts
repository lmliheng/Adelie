/**
 * The feedback routes: whether this install has a backend, and the hop that files what the
 * user typed into it.
 *
 * - GET /api/feedback needs a session and reports only whether a backend is configured —
 *   never its address or its key.
 * - Without ADELIE_FEEDBACK_URL the entry stays off and a hand-made POST is answered
 *   `feedback_not_configured`, not with a network attempt.
 * - With one, POST forwards `{title, detail}` and the configured key as `x-adelie-key`,
 *   and hands back the item id the backend reported.
 * - A backend that refuses, or that cannot be reached, is a 502 — and its own error text
 *   is not relayed to the browser.
 * - A blank title is a 400 before anything is sent; over-long title/detail are refused here
 *   with the same caps the box applies.
 *
 * Nothing here reaches the network: the hop is the suite's fetch fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedbackConfigResponse, FeedbackResponse } from "../src/api/types.js";
import { jsonResponse, stubFetch } from "./fixtures/fetch.js";
import { apiClient, createTestApp, loginAdmin } from "./helpers.js";
import type { TestApp } from "./helpers.js";

const BOX_URL = "http://127.0.0.1:3003/api/requirements";
const BOX_KEY = "box-key-0123456789";

/** A failure body's `error`, the one shape every route here refuses with. */
const errorOf = (body: unknown): { code: string; message: string } =>
  (body as { error: { code: string; message: string } }).error;

describe("feedback routes", () => {
  let app: TestApp;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("without a backend", () => {
    beforeEach(async () => {
      app = await createTestApp();
    });

    it("reports the entry as off and never dials out", async () => {
      const fake = stubFetch(() => jsonResponse({ ok: true, item: { id: "req-1" } }));
      const api = apiClient(app.app, (await loginAdmin(app.app)).cookie);
      const res = await api.get("/api/feedback");
      expect(res.status).toBe(200);
      const body = (await res.json()) as FeedbackConfigResponse;
      expect(body).toEqual({ ok: true, configured: false });
      // The address is the server's business: it must not travel, configured or not.
      expect(JSON.stringify(body)).not.toContain("3003");
      expect(fake.calls).toHaveLength(0);
    });

    it("refuses a submission with a code the UI can name", async () => {
      const fake = stubFetch(() => jsonResponse({ ok: true }));
      const api = apiClient(app.app, (await loginAdmin(app.app)).cookie);
      const res = await api.post("/api/feedback", { title: "加个深色主题", detail: "…" });
      expect(res.status).toBe(503);
      expect(errorOf(await res.json()).code).toBe("feedback_not_configured");
      expect(fake.calls).toHaveLength(0);
    });
  });

  describe("with a backend", () => {
    beforeEach(async () => {
      app = await createTestApp({ config: { feedbackUrl: BOX_URL, feedbackKey: BOX_KEY } });
    });

    it("reports the entry as on without naming the endpoint", async () => {
      const api = apiClient(app.app, (await loginAdmin(app.app)).cookie);
      const res = await api.get("/api/feedback");
      expect(res.status).toBe(200);
      const body = (await res.json()) as FeedbackConfigResponse;
      expect(body).toEqual({ ok: true, configured: true });
      expect(JSON.stringify(body)).not.toContain("3003");
      expect(JSON.stringify(body)).not.toContain(BOX_KEY);
    });

    it("forwards the words and the key, and hands back the item id", async () => {
      const fake = stubFetch((call) =>
        jsonResponse({ ok: true, item: { id: "req-7", title: "字体太小" } }, 201),
      );
      const api = apiClient(app.app, (await loginAdmin(app.app)).cookie);
      const res = await api.post("/api/feedback", {
        title: "字体太小",
        detail: "侧栏的字看不清楚",
      });
      expect(res.status).toBe(200);
      expect((await res.json()) as FeedbackResponse).toEqual({ ok: true, id: "req-7" });

      expect(fake.calls).toHaveLength(1);
      const call = fake.calls[0]!;
      expect(call.url).toBe(BOX_URL);
      expect(call.method).toBe("POST");
      expect(call.headers.get("x-adelie-key")).toBe(BOX_KEY);
      expect(call.headers.get("content-type")).toContain("application/json");
      expect(JSON.parse(call.body)).toEqual({ title: "字体太小", detail: "侧栏的字看不清楚" });
    });

    it("sends no key header when none is configured", async () => {
      const other = await createTestApp({ config: { feedbackUrl: BOX_URL, feedbackKey: null } });
      const fake = stubFetch(() => jsonResponse({ ok: true, item: { id: "req-8" } }, 201));
      const api = apiClient(other.app, (await loginAdmin(other.app)).cookie);
      const res = await api.post("/api/feedback", { title: "只有标题" });
      expect(res.status).toBe(200);
      expect(fake.calls[0]!.headers.get("x-adelie-key")).toBeNull();
      expect(JSON.parse(fake.calls[0]!.body)).toEqual({ title: "只有标题", detail: "" });
    });

    it("treats a reply without an id as a success, not a failure", async () => {
      stubFetch(() => new Response(null, { status: 204 }));
      const api = apiClient(app.app, (await loginAdmin(app.app)).cookie);
      const res = await api.post("/api/feedback", { title: "空回执" });
      expect(res.status).toBe(200);
      expect((await res.json()) as FeedbackResponse).toEqual({ ok: true });
    });

    it("answers 502 when the backend refuses, without relaying its text", async () => {
      stubFetch(() =>
        jsonResponse({ ok: false, error: "口令不对（x-adelie-key 头或 ?key=）" }, 401),
      );
      const api = apiClient(app.app, (await loginAdmin(app.app)).cookie);
      const res = await api.post("/api/feedback", { title: "会被拒" });
      expect(res.status).toBe(502);
      const error = errorOf(await res.json());
      expect(error.code).toBe("feedback_rejected");
      expect(error.message).toContain("401");
      expect(error.message).not.toContain("口令");
    });

    it("answers 502 when the backend cannot be reached", async () => {
      stubFetch(() => {
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }),
        });
      });
      const api = apiClient(app.app, (await loginAdmin(app.app)).cookie);
      const res = await api.post("/api/feedback", { title: "没人接" });
      expect(res.status).toBe(502);
      expect(errorOf(await res.json()).code).toBe("feedback_unreachable");
    });

    it("refuses a blank title before anything is sent", async () => {
      const fake = stubFetch(() => jsonResponse({ ok: true }));
      const api = apiClient(app.app, (await loginAdmin(app.app)).cookie);
      for (const title of ["", "   ", undefined]) {
        const res = await api.post("/api/feedback", { title, detail: "有正文" });
        expect(res.status).toBe(400);
      }
      expect(fake.calls).toHaveLength(0);
    });

    it("caps the title and the detail at the box's own limits", async () => {
      const fake = stubFetch(() => jsonResponse({ ok: true, item: { id: "req-9" } }, 201));
      const api = apiClient(app.app, (await loginAdmin(app.app)).cookie);
      expect((await api.post("/api/feedback", { title: "x".repeat(201) })).status).toBe(400);
      expect(
        (await api.post("/api/feedback", { title: "长正文", detail: "y".repeat(20001) })).status,
      ).toBe(400);
      expect(fake.calls).toHaveLength(0);
      // The limits themselves are inclusive: exactly at the cap is accepted.
      expect(
        (await api.post("/api/feedback", { title: "x".repeat(200), detail: "y".repeat(20000) }))
          .status,
      ).toBe(200);
      expect(fake.calls).toHaveLength(1);
    });
  });

  it("needs a session", async () => {
    app = await createTestApp({ config: { feedbackUrl: BOX_URL, feedbackKey: BOX_KEY } });
    const res = await app.app.request("/api/feedback");
    expect(res.status).toBe(401);
  });
});
