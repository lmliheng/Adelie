/**
 * The lightbox's arithmetic, apart from its markup so it can be read on its own: which picture of
 * a batch a step lands on, what a picture's own pixel size reads as, and what name a download
 * saves under.
 */

/** One picture of the lightbox's batch: what to fetch, and the words that describe it. */
export interface LightboxImage {
  src: string;
  alt: string;
}

/**
 * The index `step` moves to from `at`, wrapping at both ends — the batch is a carousel, so the
 * last picture's "next" is the first. A batch with nothing in it has only index 0 to be at.
 */
export function stepIndex(at: number, step: number, count: number): number {
  if (count <= 0) return 0;
  return (((at + step) % count) + count) % count;
}

/**
 * The badge's text: the picture's own pixel size, never the size it happens to be drawn at.
 * `null` while either side is unknown — an `<img>` that has not loaded reports 0 × 0, and a badge
 * saying "0 × 0" is worse than no badge.
 */
export function pixelSizeLabel(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  return `${Math.round(width)} × ${Math.round(height)}`;
}

/** What a `data:` URL's media type says the file is called, when it says anything. */
function dataTypeName(src: string): string | null {
  const mime = /^data:([^;,]+)/.exec(src)?.[1]?.trim().toLowerCase() ?? "";
  if (!mime.startsWith("image/")) return null;
  const subtype = mime.slice("image/".length);
  // `svg+xml` is the one subtype that carries a suffix; the rest are single words, and the two
  // abbreviations below are the ones files are actually saved as.
  if (subtype === "svg+xml") return "svg";
  if (subtype === "jpeg") return "jpg";
  if (subtype === "x-icon" || subtype === "vnd.microsoft.icon") return "ico";
  return /^[a-z0-9]+$/.test(subtype) ? subtype : null;
}

/** The last segment of a path, decoded — or `null` when the path ends in a separator. */
function lastSegment(path: string): string | null {
  const segment = path.slice(path.lastIndexOf("/") + 1);
  if (segment === "") return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    // A stray `%` is not an escape: the raw segment is still a better name than the fallback.
    return segment;
  }
}

/**
 * The name a download saves under. A URL or a path hands over its last segment, still decoded
 * (`shot%201.png` is `shot 1.png`); a route that names no file itself but carries one in `path=`
 * — the app serves a workspace picture at `…/files/content?path=shot.png` — takes that one; a
 * `data:` URL has no name of its own, so it takes the one its media type implies. Anything else
 * — a `blob:`, an empty src — takes `fallback`, which keeps the saved file's extension with it
 * (`image.png`).
 */
export function downloadName(src: string, fallback = "image"): string {
  if (src.startsWith("data:")) {
    const type = dataTypeName(src);
    return type === null ? fallback : `${fallback}.${type}`;
  }
  // A blob: URL is an opaque id, not a name; there is nothing to save it under but the fallback.
  if (src.startsWith("blob:")) return fallback;
  const [pathname = "", ...queryParts] = (src.split("#")[0] ?? "").split("?");
  const own = lastSegment(pathname);
  const carried = lastSegment(new URLSearchParams(queryParts.join("?")).get("path") ?? "");
  // The route's own last segment wins when it looks like a file name; otherwise the name it
  // carries in `path=` is the file's, and an id-shaped segment (`content`) is not.
  if (own !== null && own.includes(".")) return own;
  return carried ?? own ?? fallback;
}
