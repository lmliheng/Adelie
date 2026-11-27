/**
 * The parallel transport for a large composer attachment.
 *
 * `POST /:sessionId/attachments` sends a file as one raw request — one TCP stream. That is the
 * right shape on a fast link and the wrong one on a slow one: a single stream's throughput is
 * bounded by its congestion window over the round trip (and by any loss), so a 155MB file can
 * sit at a few Mbps no matter how much capacity the server has. Slices in flight together add
 * their windows up, which is what this module does: ask the server for a slice plan, PUT the
 * slices four at a time, then ask the server to commit them into the one attachment the
 * single-shot route would have produced.
 *
 * What the caller sees is unchanged — the same `AttachmentUploadResponse`, the same
 * `onUploadProgress(sent, total)` readings — so the composer's progress card and the send path
 * needed no knowledge of any of this. The threshold below is the only place the choice is made.
 *
 * Retries are per slice: a dropped stream loses at most one slice's worth of bytes, and re-PUTting
 * a slice is explicitly legal server-side (it overwrites the same range). A 4xx is not retried —
 * it is the server saying the request itself is wrong, and repeating it only delays the error.
 */
import { ApiError, apiFetch } from "./client";
import type { AttachmentUploadResponse, MultipartUploadStartResponse } from "@adelie/server/api";

/**
 * Files at or above this size go out in slices. Below it a single request is both faster (two
 * extra round trips for start+complete would dominate) and immune to the problem this solves
 * (a small file is over before the link's latency matters).
 */
export const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;

/** Slices in flight at once. Four is the usual compromise: enough streams to add up, few enough not to look like an attack or starve the rest of the page. */
export const MULTIPART_CONCURRENCY = 4;

/** Per-slice attempts: the first try plus two retries. A transport failure is worth two more. */
export const MULTIPART_MAX_ATTEMPTS = 3;

/** One slice of the file: `[start, end)` in bytes, and the index the server knows it by. */
export interface UploadPart {
  index: number;
  start: number;
  end: number;
}

/** The slice plan for `size` bytes at the server's `chunkSize` — always at least one part for a non-empty file. */
export function planParts(size: number, chunkSize: number): UploadPart[] {
  if (chunkSize <= 0) throw new Error("chunkSize must be positive");
  const parts: UploadPart[] = [];
  for (let start = 0, index = 0; start < size; start += chunkSize, index++) {
    parts.push({ index, start, end: Math.min(start + chunkSize, size) });
  }
  return parts;
}

/** How often the aggregated reading is pushed out; XHR fires far more often than a card can usefully repaint. */
const REPORT_INTERVAL_MS = 100;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** True for "the link or the server hiccuped" — the failures a retry can fix. */
function retryable(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500;
  return true; // XHR network error / timeout: no status at all.
}

async function withRetry<T>(attempt: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < MULTIPART_MAX_ATTEMPTS; i++) {
    try {
      return await attempt();
    } catch (err) {
      last = err;
      if (!retryable(err)) throw err;
      if (i < MULTIPART_MAX_ATTEMPTS - 1) await sleep(400 * 2 ** i);
    }
  }
  throw last;
}

const sessionPath = (sessionId: string) =>
  `/api/sessions/${encodeURIComponent(sessionId)}/attachments/multipart`;

const startUpload = (sessionId: string, body: { name: string; size: number }) =>
  apiFetch<MultipartUploadStartResponse>(sessionPath(sessionId), { method: "POST", body });

const putSlice = (
  sessionId: string,
  uploadId: string,
  index: number,
  slice: Blob,
  onUploadProgress: (sent: number, total: number) => void,
) =>
  apiFetch<void>(`${sessionPath(sessionId)}/${encodeURIComponent(uploadId)}/${index}`, {
    method: "PUT",
    rawBody: slice,
    onUploadProgress,
  });

const completeUpload = (sessionId: string, uploadId: string) =>
  apiFetch<AttachmentUploadResponse>(
    `${sessionPath(sessionId)}/${encodeURIComponent(uploadId)}/complete`,
    { method: "POST", body: {} },
  );

const abortUpload = (sessionId: string, uploadId: string) =>
  apiFetch<void>(`${sessionPath(sessionId)}/${encodeURIComponent(uploadId)}`, {
    method: "DELETE",
  });

/**
 * Upload `file` in parallel slices and return the committed attachment.
 *
 * Progress is the sum of every slice's own reading, so it moves while four streams are in flight
 * rather than in four steps. If anything fails for good, the partial upload is aborted
 * (best-effort — the server sweeps abandoned parts anyway) and the error propagates to the
 * caller, which is a send that then fails and keeps the draft in place.
 */
export async function uploadAttachmentInParts(
  sessionId: string,
  file: Blob,
  name: string,
  onUploadProgress?: (sent: number, total: number) => void,
): Promise<AttachmentUploadResponse> {
  const started = await startUpload(sessionId, { name, size: file.size });
  const parts = planParts(file.size, started.chunkSize);
  const sent = new Array<number>(parts.length).fill(0);
  let lastReportAt = 0;
  const report = (force: boolean) => {
    if (onUploadProgress === undefined) return;
    const now = Date.now();
    if (!force && now - lastReportAt < REPORT_INTERVAL_MS) return;
    lastReportAt = now;
    let total = 0;
    for (const n of sent) total += n;
    onUploadProgress(total, file.size);
  };

  let next = 0;
  const worker = async () => {
    for (;;) {
      const part = parts[next++];
      if (part === undefined) return;
      const slice = file.slice(part.start, part.end);
      const length = part.end - part.start;
      await withRetry(async () => {
        // Reset before a retry: the stream starts over, so a stale "half sent" would overstate
        // progress and the final sum would overshoot the file.
        sent[part.index] = 0;
        await putSlice(sessionId, started.uploadId, part.index, slice, (loaded) => {
          sent[part.index] = Math.min(loaded, length);
          report(false);
        });
      });
      sent[part.index] = length;
      report(false);
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(MULTIPART_CONCURRENCY, parts.length) }, worker),
    );
    const answer = await completeUpload(sessionId, started.uploadId);
    report(true);
    return answer;
  } catch (err) {
    void abortUpload(sessionId, started.uploadId).catch(() => {});
    throw err;
  }
}
