/**
 * The composer's video draft, and the two shapes a staged video takes on the wire.
 *
 * A video is the third thing the "+" menu, a drop and a paste can stage, and it differs from the
 * other two in the one place everything else follows from: how it reaches the model depends on the
 * Session's own model. A model that takes video input gets the clip inline, as a user video
 * message it can actually watch; any other model gets it as an ordinary file attachment — written
 * into the scratchpad next to the message's `[attached file: <path>]` line, exactly like a file —
 * because a video is megabytes of base64 and a request the provider would refuse is worse than one
 * the model opens by path. A *task* leaves that decision to the server (a `video_url` part is never
 * refused for it); a *steer* does not — the server refuses an inline video on a model that takes
 * none — so the composer has to pick the field itself (see steerVideoFields).
 *
 * Its ceiling is its own as well: `uploadLimits.videoMaxMb`, between an image's and a file's, the
 * provider's own video limit with base64's 4/3 accounted for.
 *
 * DOM-free and free of React: what reads the files is the composer, what the draft holds and what a
 * send turns it into is decided here.
 */
import type { TaskInputPart } from "@adelie/server/api";

/**
 * One video staged in the composer. Deliberately the same shape as a file attachment — the chip
 * shows the picked name and size, `dataUrl` is what is sent — and under the same non-copying rule:
 * the string a 32MB clip produces is held once, exactly as it was read, and everything below hands
 * that reference on instead of re-encoding or slicing it.
 */
export interface ComposerVideo {
  name: string;
  size: number;
  dataUrl: string;
}

/**
 * Approximate decoded byte size of a base64 data URL. Display only — it feeds a chip's size line
 * (a recalled video's, or a recalled file attachment's) and never a limit check. An address with no
 * data body to measure (a web URL) reports nothing rather than a number derived from the address's
 * own characters.
 */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) return 0;
  const body = dataUrl.slice(comma + 1).replace(/[=\s]+/g, "");
  return Math.floor((body.length * 3) / 4);
}

/** File extensions for the video types the composer accepts, by media type. */
const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
};

/**
 * The name a video is filed under in the draft, derived from its address alone.
 *
 * A data URL carries no name at all (the file was read into bytes and pasted into the string), so
 * it is named after its own media type — the same fallback the server uses for a nameless video, so
 * an mp4 reads as `video.mp4` on both sides. An http(s) address usually names the clip in its last
 * path segment; a bare host, a directory or a query-only address names nothing and gets the same
 * bare `video`.
 */
export function videoNameForUrl(url: string): string {
  const data = /^data:([^;,]*)/.exec(url);
  if (data !== null) {
    const extension = VIDEO_EXTENSIONS[data[1]!.trim().toLowerCase()];
    return extension === undefined ? "video" : `video.${extension}`;
  }
  // Past the protocol and the host: what names a file is the path, and `https://example.com` has
  // none (its last "segment" is the host name, which is no more a file name than the URL is).
  const path = (url.split(/[?#]/)[0] ?? "").replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
  const last = path.slice(path.lastIndexOf("/") + 1);
  if (last === "") return "video";
  try {
    return decodeURIComponent(last);
  } catch {
    return last; // A malformed escape is not a reason to lose the name.
  }
}

/**
 * A video URL as a draft entry — how a recall restores the clips of a withdrawn message, whose
 * `RecalledMessageResponse.videos` are URLs and nothing else (unlike a file attachment, a video's
 * bytes are inlined in the message, so the round trip has no scratchpad copy to read them back
 * from). A web address reports no size rather than a wrong one: this end cannot measure it.
 */
export function videoFromUrl(url: string): ComposerVideo {
  return {
    name: videoNameForUrl(url),
    size: url.startsWith("data:") ? dataUrlBytes(url) : 0,
    dataUrl: url,
  };
}

/**
 * Appends a draft's media to a task input — images first (in pick order), then videos, then files.
 * One place, because every send path submits the same draft: the normal send, the follow-up queue,
 * the @ handoff and the `/model` switch. The order is the chip row's, top to bottom, so a message
 * reads the way the composer did.
 */
export function appendMediaParts(
  input: TaskInputPart[],
  images: readonly string[],
  videos: readonly ComposerVideo[],
  files: readonly { name: string; dataUrl: string }[],
): void {
  for (const url of images) input.push({ type: "image_url", imageUrl: url });
  for (const video of videos) {
    // `fileName` only decides what the clip is called where it lands; the server sanitizes it.
    input.push({ type: "video_url", videoUrl: video.dataUrl, fileName: video.name });
  }
  for (const file of files) {
    input.push({ type: "file", fileName: file.name, dataUrl: file.dataUrl });
  }
}

/** A steering message's video fields: exactly one of the two is set (neither for no videos). */
export interface SteerVideoFields {
  /** Inline clips: for a Session whose model takes video input (POST /steer's `videos`). */
  videos?: string[];
  /** The same clips as ordinary file attachments: for a model that takes none, which would refuse `videos`. */
  files?: { fileName: string; dataUrl: string }[];
}

/**
 * Which field a steered draft's videos go into, decided by the Session's model — the one case where
 * the composer has to make the inline-or-scratchpad call itself, because the steer route rejects an
 * inline video outright on a model that takes none rather than filing it away as a task does. The
 * clips are listed before any file attachments, matching the order a task's parts travel in.
 */
export function steerVideoFields(
  videos: readonly ComposerVideo[],
  takesVideo: boolean,
): SteerVideoFields {
  if (videos.length === 0) return {};
  if (takesVideo) return { videos: videos.map((video) => video.dataUrl) };
  return { files: videos.map((video) => ({ fileName: video.name, dataUrl: video.dataUrl })) };
}
