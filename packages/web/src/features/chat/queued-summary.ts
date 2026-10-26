/**
 * The one-line summary of a queued message (undelivered steering, or a queued follow-up), shown on
 * the composer's queued hint lines: its text, then a count for each kind of attachment the text
 * cannot show (images, videos, files).
 *
 * Its own module rather than a local helper in the composer because it is the only place the
 * counts and their wording meet, and what it must not do is silent: a clip that rode a steered
 * message is invisible in the text, so a summary that dropped it would leave the user reading a
 * queued line that names only what they typed.
 */
import { S } from "../../lib/strings";

export interface QueuedMessageContent {
  text: string;
  images: number;
  videos: number;
  files: number;
}

export function steeringSummary(p: QueuedMessageContent): string {
  const parts: string[] = [];
  const line = p.text.replace(/\s+/g, " ").trim();
  if (line) parts.push(line);
  if (p.images > 0) parts.push(S.chat.imagesInMessage(p.images));
  if (p.videos > 0) parts.push(S.chat.videosInMessage(p.videos));
  if (p.files > 0) parts.push(S.chat.filesInMessage(p.files));
  return parts.join(" \u00b7 ");
}
