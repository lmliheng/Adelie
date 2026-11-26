/**
 * The corner card that says how far a message has got on the wire.
 *
 * A send has always been silent: the composer disables itself while `POST /tasks` (or `/steer`) is
 * in flight, and the request body can be enormous — a message's attachments ride it **inline** as
 * base64 (see the server's attachment-limits.ts for why, and for the 200MB ceiling), so a 177MB
 * file is a ~236MB body and, on a slow link, minutes of a page that looks stuck. `fetch` reports
 * nothing about an upload, which is why this call's transport becomes XHR (api/xhr-upload.ts); what
 * is left to add is the reading, and it goes on the package's own long-operation card —
 * `startProgress`, the same one an Agent deletion follows — which stands in the corner and stays
 * there while the user moves to another page.
 *
 * Nothing is shown below {@link UPLOAD_PROGRESS_MIN_BYTES}: a card appears only once its operation
 * has run for 600ms, and a body that small is over well before that. A finished upload closes its
 * card rather than reporting success — the message landing in the conversation is the success — and
 * a failed one closes it too, because the composer says why above the very input card that retries
 * the send.
 */
import type {
  SteerFileAttachment,
  SteerRequest,
  TaskCreateRequest,
  TaskInputPart,
} from "@adelie/server/api";
import { startProgress } from "@adelie/ui";
import * as api from "../../api/endpoints";
import { formatBytes } from "../../lib/format";
import { S } from "../../lib/strings";

/**
 * The body size below which a card would never be seen. The card's own reveal delay (600ms) is the
 * real threshold; this only keeps the machinery — the XHR transport included — out of the path of
 * the ordinary message, which is what nearly every send is.
 */
export const UPLOAD_PROGRESS_MIN_BYTES = 2 * 1024 * 1024;

/**
 * What the message's parts put on the wire. Counted from the strings the body is built out of
 * rather than by serializing it: the base64 attachments are what a big body is made of, and
 * `JSON.stringify`-ing a 236MB part list just to measure it would allocate a second copy of it.
 * Only ever compared against a threshold, so the JSON framing around the parts is noise.
 */
export function inputBytes(input: readonly TaskInputPart[]): number {
  let total = 0;
  for (const part of input) {
    switch (part.type) {
      case "text":
        total += part.text.length;
        break;
      case "image_url":
        total += part.imageUrl.length;
        break;
      case "video_url":
        total += part.videoUrl.length;
        break;
      case "file":
        // A `path`-shaped part carries no base64 at all (the file was uploaded separately), so it
        // contributes nothing to the body being measured.
        total += part.dataUrl?.length ?? 0;
        break;
    }
  }
  return total;
}

/** The same reading for a steering message, whose media are four separate lists. */
export function steerBytes(body: SteerRequest): number {
  let total = body.text.length;
  for (const url of body.images ?? []) total += url.length;
  for (const url of body.videos ?? []) total += url.length;
  for (const file of body.files ?? []) total += file.dataUrl?.length ?? 0;
  return total;
}

/**
 * Runs `post` with the card following its upload. `post` is handed the progress callback — as
 * `undefined` below the threshold, which is also what leaves the request on its usual `fetch`
 * transport.
 */
async function withUploadProgress<T>(
  bytes: number,
  post: (onUploadProgress?: (sent: number, total: number) => void) => Promise<T>,
): Promise<T> {
  const card =
    bytes < UPLOAD_PROGRESS_MIN_BYTES ? null : startProgress({ title: S.chat.uploadingMessage });
  try {
    const result = await post(
      card === null
        ? undefined
        : (sent, total) =>
            card.update({
              value: sent,
              max: total,
              detail: S.chat.uploadProgressDetail(formatBytes(sent), formatBytes(total)),
            }),
    );
    card?.close();
    return result;
  } catch (err) {
    // Closed, not finished as failed: the reason this upload died is already said by whoever
    // catches it — the composer's refusal line above the input card (message-send-refusal.ts).
    card?.close();
    throw err;
  }
}

/** {@link api.postTask}, with the corner card following the body out. */
export function postTaskWithUploadProgress(
  sessionId: string,
  body: TaskCreateRequest,
): Promise<Awaited<ReturnType<typeof api.postTask>>> {
  return withUploadProgress(inputBytes(body.input), (onUploadProgress) =>
    api.postTask(sessionId, body, onUploadProgress),
  );
}

/** {@link api.postSteer}, with the same card. */
export function postSteerWithUploadProgress(sessionId: string, body: SteerRequest): Promise<void> {
  return withUploadProgress(steerBytes(body), (onUploadProgress) =>
    api.postSteer(sessionId, body, onUploadProgress),
  );
}

/**
 * One file attachment staged in the composer, before anything has been sent.
 *
 * The three shapes differ only in *where the bytes are*, and that is exactly what decides how the
 * file reaches the model's scratchpad:
 *
 * - `inline` — read into a base64 `data:` URL and sent inside the task/steer body, precisely as
 *   attachments have always travelled. The small-file path.
 * - `direct` — held as the picked `File` itself, to be uploaded on its own (`POST …/attachments`)
 *   when the send reaches a Session. The large-file path: a 177MB attachment as base64 is a ~236MB
 *   request body, and building one is what kills the tab (see lib/upload-limits
 *   DIRECT_UPLOAD_MIN_BYTES).
 * - `uploaded` — already on the Session scratchpad, so it carries a `path` instead of a `File`.
 *   This is what a recall of a `direct` attachment hands back (the server leaves the file in place
 *   rather than re-encoding it — see the server's readRecalledFiles), and it needs no upload.
 */
export interface InlineComposerFile {
  kind: "inline";
  name: string;
  size: number;
  dataUrl: string;
}

export interface DirectComposerFile {
  kind: "direct";
  name: string;
  size: number;
  file: File;
}

export interface UploadedComposerFile {
  kind: "uploaded";
  name: string;
  size: number;
  path: string;
}

export type ComposerFile = InlineComposerFile | DirectComposerFile | UploadedComposerFile;

/** A {@link ComposerFile} whose bytes are known to be within the Session scratchpad (or in hand as base64) — every `direct` one uploaded on the way here. */
export type ResolvedComposerFile = InlineComposerFile | UploadedComposerFile;

/**
 * Get a draft's file attachments into the Session's scratchpad and report where each one landed.
 * The `direct` ones are the whole job: each goes out over its own request — raw bytes, following a
 * card of its own — and comes back as an `uploaded` entry naming the path it got. `inline` and
 * already-`uploaded` entries pass through untouched.
 *
 * Sequential rather than in parallel: the cards then read one at a time instead of a stack of
 * identical ones, and the files keep the order they were picked in, which is the order their
 * `[attached file: …]` lines will appear in. A failure stops the batch and propagates — the caller
 * is a send that then fails too, keeping the draft (the `File` is still in the chip, so a retry
 * simply re-uploads). The card is closed either way, because the composer's refusal line is what
 * explains a failure, not the card.
 */
export async function resolveComposerFiles(
  sessionId: string,
  files: readonly ComposerFile[],
): Promise<ResolvedComposerFile[]> {
  const resolved: ResolvedComposerFile[] = [];
  for (const file of files) {
    if (file.kind !== "direct") {
      resolved.push(file);
      continue;
    }
    const card = startProgress({ title: S.chat.uploadingAttachment(file.name) });
    try {
      const answer = await api.uploadSessionAttachment(
        sessionId,
        file.file,
        file.name,
        (sent, total) =>
          card.update({
            value: sent,
            max: total,
            detail: S.chat.uploadProgressDetail(formatBytes(sent), formatBytes(total)),
          }),
      );
      card.close();
      resolved.push({
        kind: "uploaded",
        name: answer.fileName,
        size: answer.bytes,
        path: answer.path,
      });
    } catch (err) {
      card.close();
      throw err;
    }
  }
  return resolved;
}

/**
 * The `{type:"file"}` parts a resolved draft contributes, in draft order. Built here rather than by
 * each host so a task and a steer cannot disagree on the inline/`path` shape (see TaskInputPart).
 */
export function filePartsOf(files: readonly ResolvedComposerFile[]): TaskInputPart[] {
  return files.map((file) =>
    file.kind === "inline"
      ? { type: "file", fileName: file.name, dataUrl: file.dataUrl }
      : { type: "file", fileName: file.name, path: file.path },
  );
}

/** The same attachments in the shape a steer request's `files` list takes (see SteerFileAttachment). */
export function steerFileAttachmentsOf(
  files: readonly ResolvedComposerFile[],
): SteerFileAttachment[] {
  return files.map((file) =>
    file.kind === "inline"
      ? { fileName: file.name, dataUrl: file.dataUrl }
      : { fileName: file.name, path: file.path },
  );
}
