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
import type { SteerRequest, TaskCreateRequest, TaskInputPart } from "@adelie/server/api";
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
        total += part.dataUrl.length;
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
  for (const file of body.files ?? []) total += file.dataUrl.length;
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
