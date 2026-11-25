/**
 * The upload-progress transport (src/api/xhr-upload.ts), driven by the suite's XHR fake.
 *
 * - What the app asks of the request: the method, the URL, the JSON content type, the serialized
 *   body, and same-origin cookie auth (the same things `fetch` gets from the shared request init).
 * - The readings: every computable upload event reaches the caller; one the browser cannot compute
 *   is dropped, because a percentage of an unknown whole is not a reading.
 * - The answer: handed back as a real `Response`, so the shared `failureOf` mapping and the
 *   `Date`/`ETag` reads work on it exactly as they do on a `fetch` answer — including a 4xx
 *   envelope, a 204 with no body, and a connection that fails.
 * - An abort signal closes the request.
 */
import { describe, expect, it } from "vitest";
import { xhrUpload } from "../src/api/xhr-upload";
import { FakeXhr, fakeXhrFactory } from "./helpers/xhr";

/** The request the app would send, with `onProgress` collecting its readings. */
function upload(onProgress = () => {}) {
  const readings: { sent: number; total: number }[] = [];
  const promise = xhrUpload(
    "/api/sessions/s1/tasks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: [] }),
    },
    (sent, total) => {
      readings.push({ sent, total });
      onProgress();
    },
    fakeXhrFactory,
  );
  return { promise, readings, xhr: FakeXhr.last() };
}

describe("xhrUpload", () => {
  it("sends what the fetch path would have sent", () => {
    const { xhr } = upload();
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/sessions/s1/tasks");
    expect(xhr.headers["Content-Type"]).toBe("application/json");
    expect(xhr.body).toBe(JSON.stringify({ input: [] }));
    // Same-origin cookie auth, which is what `credentials: "same-origin"` asks of `fetch`.
    expect(xhr.withCredentials).toBe(true);
  });

  it("reports every computable upload reading and drops the rest", () => {
    const { promise, readings, xhr } = upload();
    xhr.progress(1024, 8192);
    xhr.progress(4096, 8192);
    xhr.progress(0, 0, false); // no total: nothing a percentage could be taken against
    expect(readings).toEqual([
      { sent: 1024, total: 8192 },
      { sent: 4096, total: 8192 },
    ]);
    xhr.respond(200, "{}");
    void promise;
  });

  it("hands the answer back as a Response, headers and body included", async () => {
    const { promise, xhr } = upload();
    xhr.progress(8192, 8192);
    xhr.respond(200, JSON.stringify({ session: { sessionId: "s1" } }), {
      date: "Wed, 26 Nov 2026 06:00:00 GMT",
      etag: '"v3"',
    });
    const response = await promise;
    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ session: { sessionId: "s1" } });
    // The two reads the shared api layer does on every answer.
    expect(response.headers.get("date")).toBe("Wed, 26 Nov 2026 06:00:00 GMT");
    expect(response.headers.get("etag")).toBe('"v3"');
  });

  it("carries a failure's envelope through unchanged, for the shared mapping to read", async () => {
    const { promise, xhr } = upload();
    xhr.respond(413, JSON.stringify({ error: { code: "file_too_large", message: "too big" } }), {
      "retry-after": "5",
    });
    const response = await promise;
    // Not thrown here: the transport answers, and apiFetch's `failureOf` turns it into an ApiError.
    expect(response.status).toBe(413);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(await response.json()).toEqual({
      error: { code: "file_too_large", message: "too big" },
    });
  });

  it("builds no body for a status that may not have one", async () => {
    const { promise, xhr } = upload();
    xhr.respond(204, "");
    expect((await promise).status).toBe(204);
  });

  it("rejects when the connection fails", async () => {
    const { promise, xhr } = upload();
    xhr.fail();
    await expect(promise).rejects.toThrow();
  });

  it("closes the request when the caller's signal aborts", async () => {
    const controller = new AbortController();
    const promise = xhrUpload(
      "/api/sessions/s1/tasks",
      { method: "POST", body: "{}", signal: controller.signal },
      () => {},
      fakeXhrFactory,
    );
    const xhr = FakeXhr.last();
    controller.abort();
    await expect(promise).rejects.toThrow();
    expect(xhr.aborted).toBe(true);
  });
});
