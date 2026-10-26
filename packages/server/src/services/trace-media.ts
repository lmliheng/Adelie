/**
 * Images and videos by reference on windowed history pages.
 *
 * A Trace stores media inline, as base64 `data:` URLs: the user's `image_url` and `video_url`
 * records, and the `images` of a tool output (a screenshot is ~1.5 MB of text). A windowed
 * `GET /messages` page replaces each of them with the URL of the route that serves that one
 * item back out of the Trace record, so a page costs only its text and the browser fetches
 * each picture — or video — as it draws it. The parameterless full read is left alone.
 *
 * URLs: `/api/sessions/<sessionId>/trace-image?file=<fileIndex>&ordinal=<ordinal>[&i=<k>]` and
 * `/api/sessions/<sessionId>/trace-video?file=<fileIndex>&ordinal=<ordinal>`, where (file,
 * ordinal) is the record's `tracePosition`; without `i` the image route names the record's
 * `image_url`, with `i` the tool output's `images[k]`. A Trace record never changes, so the
 * routes answer them as immutable.
 *
 * A video is referenced for a blunter version of the image's reason: it is tens of megabytes
 * of base64, so the one page that carried it inline would have to be read back whole — into a
 * single JS string — before anything could be drawn at all.
 *
 * Only raster types a browser renders inertly are referenced (the scratchpad route's
 * allowlist): the route serves bytes on the app's own origin, and an `image/svg+xml` or
 * `text/html` data URL served there would be a document, not a picture. Any other data URL
 * stays inline, where it is as harmless as it always was. A video whose type is outside the
 * set the task route accepts stays inline for the same reason.
 */
import type {
  ImageUrlPayload,
  OmniMessage,
  ToolCallOutputPayload,
  VideoUrlPayload,
} from "@adelie/core";
import type { HistoryMessage, TracePosition } from "../api/types.js";

/** Image types the trace-image route serves (core's own supported set). */
const REFERENCED_IMAGE_MIMES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/**
 * Video types the trace-video route serves — the same ones the task route names a video file
 * by (its VIDEO_MIME_EXTENSIONS) and the same ones providers take. Kept apart from that table
 * because the two answer different questions (can this be served here / what shall the file be
 * called) and a type may be nameable without being servable; they are the provider's set
 * either way, so they move together.
 */
const REFERENCED_VIDEO_MIMES: ReadonlySet<string> = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/x-msvideo",
]);

/** A base64 data URL the route can serve: its type, and where its payload starts. */
function referableDataUrl(
  url: string,
  mimes: ReadonlySet<string>,
): { mime: string; dataStart: number } | null {
  if (!url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma < 0 || comma === url.length - 1) return null;
  const header = url.slice("data:".length, comma).toLowerCase();
  if (!header.endsWith(";base64")) return null;
  const mime = header.slice(0, header.indexOf(";")).trim();
  return mimes.has(mime) ? { mime, dataStart: comma + 1 } : null;
}

/** The route URL of one image slot of the record at `at` (`slot` = index into a tool output's `images`). */
export function traceImageUrl(sessionId: string, at: TracePosition, slot?: number): string {
  const query = `file=${at.fileIndex}&ordinal=${at.ordinal}${slot !== undefined ? `&i=${slot}` : ""}`;
  return `/api/sessions/${encodeURIComponent(sessionId)}/trace-image?${query}`;
}

/** The route URL of the record at `at`'s own video (the `video_url` of a user message). */
export function traceVideoUrl(sessionId: string, at: TracePosition): string {
  const query = `file=${at.fileIndex}&ordinal=${at.ordinal}`;
  return `/api/sessions/${encodeURIComponent(sessionId)}/trace-video?${query}`;
}

/**
 * The message as a windowed page serves it: each referable image or video of a main-session
 * record (one that carries its `tracePosition`) replaced by its route URL. Expanded subagent
 * messages carry no position and stay inline. The input is never mutated; a message with
 * nothing to replace is returned as is.
 */
export function withMediaByReference(sessionId: string, msg: HistoryMessage): HistoryMessage {
  const at = msg.tracePosition;
  if (at === undefined || msg.type !== "model_msg") return msg;
  const kind = (msg.payload as { type?: string }).type;
  if (kind === "image_url") {
    const payload = msg.payload as ImageUrlPayload;
    if (
      typeof payload.image_url !== "string" ||
      referableDataUrl(payload.image_url, REFERENCED_IMAGE_MIMES) === null
    ) {
      return msg;
    }
    return { ...msg, payload: { ...payload, image_url: traceImageUrl(sessionId, at) } };
  }
  if (kind === "video_url") {
    const payload = msg.payload as VideoUrlPayload;
    if (
      typeof payload.video_url !== "string" ||
      referableDataUrl(payload.video_url, REFERENCED_VIDEO_MIMES) === null
    ) {
      return msg;
    }
    return { ...msg, payload: { ...payload, video_url: traceVideoUrl(sessionId, at) } };
  }
  if (kind === "tool_call_output") {
    const payload = msg.payload as ToolCallOutputPayload;
    if (!Array.isArray(payload.images)) return msg;
    let replaced = false;
    const images = payload.images.map((image, k) => {
      if (typeof image !== "string" || referableDataUrl(image, REFERENCED_IMAGE_MIMES) === null) {
        return image;
      }
      replaced = true;
      return traceImageUrl(sessionId, at, k);
    });
    if (replaced) return { ...msg, payload: { ...payload, images } };
  }
  return msg;
}

/**
 * The decoded media in one slot of a Trace record: the user image (`kind` "image", `slot`
 * undefined) or video (`kind` "video") of an `image_url` / `video_url` record, or a tool
 * output's `images[slot]`. Null when that slot holds nothing of that kind the route serves —
 * the same test the page applied before it handed out the URL.
 */
export function traceRecordMedia(
  record: OmniMessage,
  slot: number | undefined,
  kind: "image" | "video",
): { mime: string; bytes: Buffer } | null {
  if (record.type !== "model_msg") return null;
  const p = record.payload as {
    type?: string;
    image_url?: unknown;
    video_url?: unknown;
    images?: unknown;
  };
  const mimes = kind === "video" ? REFERENCED_VIDEO_MIMES : REFERENCED_IMAGE_MIMES;
  let url: unknown;
  if (slot === undefined) {
    const wanted = kind === "video" ? "video_url" : "image_url";
    url = p.type === wanted ? (kind === "video" ? p.video_url : p.image_url) : undefined;
  } else if (p.type === "tool_call_output" && Array.isArray(p.images)) {
    url = (p.images as unknown[])[slot];
  }
  if (typeof url !== "string") return null;
  const media = referableDataUrl(url, mimes);
  if (media === null) return null;
  return { mime: media.mime, bytes: Buffer.from(url.slice(media.dataStart), "base64") };
}
