/**
 * The corner card that follows a message out (src/features/chat/message-upload-progress.ts),
 * against the real endpoints, the real progress store, the suite's fetch fake and its XHR fake.
 *
 * - The body size the threshold reads is measured from the parts themselves, for both a task and a
 *   steering message.
 * - A body below the threshold is left exactly as it was: the ordinary `fetch` transport, no card.
 * - A body above it goes out over XHR, and the card appears once the operation has run long enough
 *   to be worth reporting; it starts indeterminate (no reading yet) and then tracks the readings —
 *   bytes sent out of the whole body.
 * - The card closes when the send answers, whether it succeeded or not: a message that landed is its
 *   own confirmation, and a failed one is explained by the composer's refusal line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROGRESS_REVEAL_MS, progressStore } from "@adelie/ui";
import { apiError, json, stubFetch } from "./helpers/fetch";
import { FakeXhr, stubXhr } from "./helpers/xhr";
import {
  inputBytes,
  postSteerWithUploadProgress,
  postTaskWithUploadProgress,
  steerBytes,
  UPLOAD_PROGRESS_MIN_BYTES,
} from "../src/features/chat/message-upload-progress";
import { ApiError } from "../src/api/client";
import { S } from "../src/lib/strings";

const card = () => progressStore.getState().items[0];
/** A data URL as long as `bytes` of base64 payload — nothing decodes it here, only its length matters. */
const dataUrl = (bytes: number) =>
  `data:application/octet-stream;base64,${"A".repeat(Math.ceil((bytes / 3) * 4))}`;
const SIZE = "\\d+(\\.\\d+)?(B|KB|MB|GB) \\/ \\d+(\\.\\d+)?(B|KB|MB|GB)";

beforeEach(() => {
  vi.useFakeTimers();
  progressStore.setState({ items: [] });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  progressStore.setState({ items: [] });
});

describe("measuring a message's body", () => {
  it("adds up the parts' own strings", () => {
    expect(
      inputBytes([
        { type: "text", text: "12345" },
        { type: "image_url", imageUrl: "1234567" },
        { type: "video_url", videoUrl: "123456789" },
        { type: "file", fileName: "a.bin", dataUrl: "123" },
      ]),
    ).toBe(5 + 7 + 9 + 3);
  });

  it("reads a steering message's four lists", () => {
    expect(
      steerBytes({
        text: "12",
        images: ["1234"],
        videos: ["123456"],
        files: [{ fileName: "a.bin", dataUrl: "12345678" }],
      }),
    ).toBe(2 + 4 + 6 + 8);
  });
});

describe("the card", () => {
  it("is not raised for a body that is over before it could be read", async () => {
    const fetch = stubFetch(() => json({ sessionId: "s1" }));
    stubXhr();
    const ok = await postTaskWithUploadProgress("s1", {
      input: [{ type: "text", text: "hello" }],
    });
    expect(ok.sessionId).toBe("s1");
    // The ordinary transport, untouched: no request object, no card.
    expect(fetch.requests).toHaveLength(1);
    expect(FakeXhr.instances).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(PROGRESS_REVEAL_MS + 100);
    expect(progressStore.getState().items).toHaveLength(0);
  });

  it("follows a big body out on the XHR transport and closes when it answers", async () => {
    stubFetch(() => json({ sessionId: "s1" }));
    stubXhr();
    const body = {
      input: [{ type: "file" as const, fileName: "big.bin", dataUrl: dataUrl(3 * 1024 * 1024) }],
    };
    expect(inputBytes(body.input)).toBeGreaterThan(UPLOAD_PROGRESS_MIN_BYTES);

    const sent = postTaskWithUploadProgress("s1", body);
    const xhr = FakeXhr.last();
    expect(xhr.url).toBe("/api/sessions/s1/tasks");

    // Raised, but not shown yet: the card appears only once the operation has run 600ms.
    expect(card()?.shown).toBe(false);
    await vi.advanceTimersByTimeAsync(PROGRESS_REVEAL_MS);
    expect(card()?.title).toBe(S.chat.uploadingMessage);
    // Nothing reading yet: an indeterminate bar, not a 0% one.
    expect(card()?.value).toBeUndefined();

    xhr.progress(1024 * 1024, 4 * 1024 * 1024);
    expect(card()?.value).toBe(1024 * 1024);
    expect(card()?.max).toBe(4 * 1024 * 1024);
    expect(card()?.detail).toMatch(new RegExp(`^${SIZE}$`));

    xhr.respond(200, JSON.stringify({ sessionId: "s1" }));
    await expect(sent).resolves.toEqual({ sessionId: "s1" });
    expect(card()?.leaving).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(progressStore.getState().items).toHaveLength(0);
  });

  it("closes on a refusal and lets the refusal through", async () => {
    stubFetch(() => apiError(413, "file_too_large"));
    stubXhr();
    const sent = postTaskWithUploadProgress("s1", {
      input: [{ type: "file", fileName: "big.bin", dataUrl: dataUrl(3 * 1024 * 1024) }],
    });
    const xhr = FakeXhr.last();
    await vi.advanceTimersByTimeAsync(PROGRESS_REVEAL_MS);
    expect(card()?.shown).toBe(true);

    xhr.respond(413, JSON.stringify({ error: { code: "file_too_large", message: "too big" } }));
    await expect(sent).rejects.toBeInstanceOf(ApiError);
    await expect(sent).rejects.toMatchObject({ status: 413, code: "file_too_large" });
    expect(card()?.leaving).toBe(true);
  });

  it("carries a steering message's body the same way", async () => {
    const fetch = stubFetch(() => new Response(null, { status: 204 }));
    stubXhr();
    const steer = postSteerWithUploadProgress("s1", {
      text: "look at this",
      files: [{ fileName: "big.bin", dataUrl: dataUrl(3 * 1024 * 1024) }],
    });
    const xhr = FakeXhr.last();
    expect(xhr.url).toBe("/api/sessions/s1/steer");
    await vi.advanceTimersByTimeAsync(PROGRESS_REVEAL_MS);
    expect(card()?.title).toBe(S.chat.uploadingMessage);
    xhr.progress(2048, 4096);
    expect(card()?.value).toBe(2048);

    xhr.respond(204, "");
    await expect(steer).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(1000);
    expect(progressStore.getState().items).toHaveLength(0);
    expect(fetch.requests).toHaveLength(0); // never fell back to fetch
  });
});
