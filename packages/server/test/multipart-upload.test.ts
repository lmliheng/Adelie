/**
 * Chunked, parallel attachment upload (services/multipart-uploads.ts and the four routes in
 * routes/sessions.ts that drive it).
 *
 * The single-shot route's behaviour is covered where it always was (task-attachments.test.ts);
 * this file is about the second transport: a slice plan the client must follow, slices that may
 * arrive in any order (and more than once), a commit that refuses a hole, and the fact that a
 * half-uploaded file never becomes an `[attached file: …]` the model can open.
 */
import fs from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adoptSession, fakeSession, uniqueSessionId } from "./fixtures/session.js";
import { createTestApp, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

const MB = 1024 * 1024;

/** One slice's worth of recognizable bytes: every byte in slice `fill` is `fill`. */
function slice(fill: number, size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.fill(fill);
  return bytes;
}

describe("chunked attachment upload", () => {
  let t: TestApp;
  let cookie: string;
  let SID: string;

  const put = (uploadId: string, index: number, body: Uint8Array) =>
    t.app.request(`/api/sessions/${SID}/attachments/multipart/${uploadId}/${index}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/octet-stream" },
      body,
    });

  const start = (body: Record<string, unknown>) =>
    t.app.request(`/api/sessions/${SID}/attachments/multipart`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const complete = (uploadId: string) =>
    t.app.request(`/api/sessions/${SID}/attachments/multipart/${uploadId}/complete`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "{}",
    });

  async function plan(
    size: number,
  ): Promise<{ uploadId: string; chunkSize: number; totalChunks: number }> {
    const res = await start({ name: "big.bin", size });
    expect(res.status).toBe(201);
    return (await res.json()) as { uploadId: string; chunkSize: number; totalChunks: number };
  }

  beforeAll(async () => {
    t = await createTestApp();
    ({ cookie } = await provisionUser(t.app, "uploader"));
  });
  afterAll(async () => {
    await t.cleanup();
  });
  beforeEach(() => {
    SID = uniqueSessionId();
    adoptSession(t.deps, fakeSession(SID), { projectId: "uploader-default_project" });
  });

  it("commits the slices into one file in the order they were announced, not received", async () => {
    const size = 2 * 4 * MB + 123; // two full slices and a tail
    const p = await plan(size);
    expect(p.chunkSize).toBe(4 * MB);
    expect(p.totalChunks).toBe(3);

    // Out of order on purpose: the server keys by index, so arrival order must not matter.
    expect((await put(p.uploadId, 2, slice(0xcc, 123))).status).toBe(204);
    expect((await put(p.uploadId, 0, slice(0xaa, 4 * MB))).status).toBe(204);
    expect((await put(p.uploadId, 1, slice(0xbb, 4 * MB))).status).toBe(204);

    const res = await complete(p.uploadId);
    expect(res.status).toBe(201);
    const answer = (await res.json()) as { fileName: string; path: string; bytes: number };
    expect(answer.bytes).toBe(size);
    expect(answer.fileName).toBe("big.bin");

    const bytes = await fs.readFile(answer.path);
    expect(bytes.length).toBe(size);
    expect(bytes[0]).toBe(0xaa);
    expect(bytes[4 * MB - 1]).toBe(0xaa);
    expect(bytes[4 * MB]).toBe(0xbb);
    expect(bytes[8 * MB]).toBe(0xcc);
    expect(bytes[size - 1]).toBe(0xcc);
  });

  it("a re-sent slice overwrites its own range and the upload still commits", async () => {
    const p = await plan(4 * MB + 10);
    await put(p.uploadId, 0, slice(0x11, 4 * MB));
    await put(p.uploadId, 1, slice(0x22, 10));
    // The link dropped after the server had written slice 0, so the client sends it again.
    expect((await put(p.uploadId, 0, slice(0x33, 4 * MB))).status).toBe(204);
    const res = await complete(p.uploadId);
    expect(res.status).toBe(201);
    const { path } = (await res.json()) as { path: string };
    const bytes = await fs.readFile(path);
    expect(bytes[0]).toBe(0x33);
    expect(bytes[4 * MB]).toBe(0x22);
  });

  it("refuses a commit with a missing slice and leaves no committed file behind", async () => {
    const p = await plan(4 * MB + 10);
    await put(p.uploadId, 0, slice(1, 4 * MB));
    const res = await complete(p.uploadId);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "upload_incomplete",
    );
    // Nothing committed under the announced name: a hole is a part file, not an attachment.
    const probe = await t.app.request(`/api/sessions/${SID}/scratchpad/big.bin`, {
      headers: { cookie },
    });
    expect(probe.status).toBe(404);
  });

  it("refuses a slice whose length is not its own", async () => {
    const p = await plan(4 * MB + 10);
    const short = await put(p.uploadId, 0, slice(1, 4 * MB - 1));
    expect(short.status).toBe(400);
    const long = await put(p.uploadId, 1, slice(1, 11));
    expect(long.status).toBe(400);
    // Neither attempt may count as the slice: completion still reports it missing.
    expect((await complete(p.uploadId)).status).toBe(409);
  });

  it("refuses a size over the admin's per-file cap before reserving any disk", async () => {
    const previous = t.deps.serverSettingsRepo.getAttachmentLimitsMb();
    t.deps.serverSettingsRepo.setAttachmentMaxMb(1);
    t.deps.serverSettingsRepo.setAttachmentTotalMb(1);
    try {
      const res = await start({ name: "too.bin", size: 2 * MB });
      expect(res.status).toBe(413);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("file_too_large");
    } finally {
      t.deps.serverSettingsRepo.setAttachmentMaxMb(previous.attachmentMaxMb);
      t.deps.serverSettingsRepo.setAttachmentTotalMb(previous.attachmentTotalMb);
    }
  });

  it("validates the announced name like the single-shot route does", async () => {
    const res = await start({ name: "../escape.bin", size: 10 });
    expect(res.status).toBe(400);
  });

  it("drops the part file on abort; the id is unknown afterwards", async () => {
    const p = await plan(4 * MB);
    await put(p.uploadId, 0, slice(1, 4 * MB));
    const del = await t.app.request(`/api/sessions/${SID}/attachments/multipart/${p.uploadId}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(del.status).toBe(204);
    expect((await complete(p.uploadId)).status).toBe(404);
  });

  it("keeps one Session's upload out of another Session's reach", async () => {
    const p = await plan(4 * MB);
    const other = uniqueSessionId();
    adoptSession(t.deps, fakeSession(other), { projectId: "uploader-default_project" });
    const res = await t.app.request(
      `/api/sessions/${other}/attachments/multipart/${p.uploadId}/complete`,
      { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" },
    );
    expect(res.status).toBe(404);
  });
});
