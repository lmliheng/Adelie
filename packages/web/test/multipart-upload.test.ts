/**
 * The parallel transport for large attachments (api/multipart-upload.ts).
 *
 * - The slice plan is arithmetic: every slice but the last is `chunkSize`, and a file that does
 *   not divide evenly ends with its remainder.
 * - A large file goes out as slices over XHR — at most four at a time — and the answer is the
 *   completion response, with progress summed across slices rather than reported per slice.
 * - A slice the server refuses for a reason (4xx) is not retried: the upload is aborted and the
 *   error reaches the caller. Retrying that request could only repeat the same refusal.
 * - A file below the threshold never touches the multipart routes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "./helpers/fetch";
import { FakeXhr, stubXhr } from "./helpers/xhr";
import {
  MULTIPART_CONCURRENCY,
  planParts,
  uploadAttachmentInParts,
} from "../src/api/multipart-upload";
import { uploadSessionAttachment } from "../src/api/endpoints";

const KB = 1024;

afterEach(() => {
  FakeXhr.instances.length = 0;
  vi.unstubAllGlobals();
});

describe("slice planning", () => {
  it("splits evenly and keeps the remainder last", () => {
    expect(planParts(4 * KB + 1, KB)).toEqual([
      { index: 0, start: 0, end: KB },
      { index: 1, start: KB, end: 2 * KB },
      { index: 2, start: 2 * KB, end: 3 * KB },
      { index: 3, start: 3 * KB, end: 4 * KB },
      { index: 4, start: 4 * KB, end: 4 * KB + 1 },
    ]);
  });

  it("has no parts for an empty file", () => {
    expect(planParts(0, KB)).toEqual([]);
  });
});

describe("uploading in slices", () => {
  it("puts the slices out four at a time and completes the upload", async () => {
    const size = 6 * KB;
    const fetch = stubFetch((request) => {
      if (request.path.endsWith("/attachments/multipart")) {
        return json({ uploadId: "u1", chunkSize: KB, totalChunks: 6 }, 201);
      }
      if (request.path.endsWith("/complete")) {
        return json({ fileName: "big.bin", path: "/p/big.bin", bytes: size }, 201);
      }
      throw new Error(`unexpected fetch ${request.method} ${request.path}`);
    });
    stubXhr();

    const readings: number[] = [];
    const promise = uploadAttachmentInParts(
      "s1",
      new Blob([new Uint8Array(size)]),
      "big.bin",
      (sent) => readings.push(sent),
    );

    // The plan is asked first, then four workers each start a slice.
    await vi.waitFor(() => expect(FakeXhr.instances.length).toBe(MULTIPART_CONCURRENCY));
    expect(fetch.requests[0]!.method).toBe("POST");
    expect(FakeXhr.instances[0]!.method).toBe("PUT");

    for (const xhr of [...FakeXhr.instances]) xhr.respond(204);
    await vi.waitFor(() => expect(FakeXhr.instances.length).toBe(6));
    for (const xhr of FakeXhr.instances.slice(4)) xhr.respond(204);

    const answer = await promise;
    expect(answer).toEqual({ fileName: "big.bin", path: "/p/big.bin", bytes: size });
    // Every byte reported once the commit answered, whatever the intermediate throttling did.
    expect(readings.at(-1)).toBe(size);
    // The URLs name their own slice.
    const indexes = FakeXhr.instances.map((x) => x.url.split("/").at(-1));
    expect(new Set(indexes)).toEqual(new Set(["0", "1", "2", "3", "4", "5"]));
    expect(fetch.requests.at(-1)!.path.endsWith("/complete")).toBe(true);
  });

  it("does not retry a refusal, and aborts the upload", async () => {
    stubFetch((request) => {
      if (request.path.endsWith("/attachments/multipart")) {
        return json({ uploadId: "u2", chunkSize: KB, totalChunks: 2 }, 201);
      }
      if (request.method === "DELETE") return new Response(null, { status: 204 });
      if (request.path.endsWith("/complete")) {
        return json({ fileName: "big.bin", path: "/p/big.bin", bytes: 2 * KB }, 201);
      }
      throw new Error(`unexpected fetch ${request.method} ${request.path}`);
    });
    stubXhr();

    const promise = uploadAttachmentInParts("s1", new Blob([new Uint8Array(2 * KB)]), "big.bin");
    await vi.waitFor(() => expect(FakeXhr.instances.length).toBe(2));
    FakeXhr.instances[0]!.respond(400, JSON.stringify({ error: { code: "bad_chunk" } }));
    FakeXhr.instances[1]!.respond(204);

    await expect(promise).rejects.toThrow();
    // No second attempt at the refused slice: the request count for index 0 stayed at one.
    const indexZero = FakeXhr.instances.filter((x) => x.url.endsWith("/0"));
    expect(indexZero).toHaveLength(1);
  });

  it("leaves small files on the single-shot route", async () => {
    const fetch = stubFetch(() =>
      json({ fileName: "small.bin", path: "/p/small.bin", bytes: 10 }, 201),
    );
    const file = new File([new Uint8Array(10)], "small.bin");
    const answer = await uploadSessionAttachment("s1", file, "small.bin");
    expect(answer.fileName).toBe("small.bin");
    expect(fetch.requests).toHaveLength(1);
    expect(fetch.requests[0]!.path).toBe("/api/sessions/s1/attachments");
    expect(fetch.requests[0]!.query.get("name")).toBe("small.bin");
  });
});
