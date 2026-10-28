/**
 * Where a picture in a conversation's Markdown comes from.
 *
 * A model names the pictures it made the way a README would — `![预览](shot.png)`, relative to the
 * Workspace it works in. The browser resolves that src against the SPA's own route
 * (`/chat/shot.png`, a page that does not exist), so every Workspace picture a reply pointed at
 * rendered as a broken image and the only way to see it was the Files panel — which is why the
 * image plugin's own skill told the agent not to use Markdown image syntax at all. Inside a
 * conversation a src is therefore sorted before it renders:
 *
 * - `external` — it names a scheme (`https:`, `data:`, …) or is protocol-relative (`//host`).
 *   The browser fetches it as it stands.
 * - `file` — anything else that resolves to a Workspace-relative path. The src is percent-decoded
 *   first (the renderer encodes non-ASCII, so a CJK file name arrives as `%E4%B8%AD…`), its query
 *   and hash are dropped — `shot.png#v=2` is a cache-buster a model sometimes writes — and it is
 *   then normalized exactly as a file link is (`toWorkspaceRelative`): `./` and empty segments
 *   drop, an inner `..` pops, and an absolute path counts only when it lies inside the Session's
 *   Workspace.
 * - `none` — the rest: a `..` that climbs out of the Workspace, an absolute path outside it, a
 *   `~` path, an in-page `#…` reference, and a src the renderer emptied. Nothing in the App can
 *   serve it.
 *
 * Existence is deliberately not checked, exactly like a file link: the file route answers 404 and
 * the browser shows its own broken-image state, which is the truth about that src.
 */
import { toWorkspaceRelative } from "./file-path";
import { isExternalRef } from "./reply-link";

export type ReplyImage = { kind: "external" } | { kind: "file"; path: string } | { kind: "none" };

const EXTERNAL: ReplyImage = { kind: "external" };
const NONE: ReplyImage = { kind: "none" };

function decode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/** Sorts one image src from a conversation's Markdown; `workspace` is the Session's absolute Workspace path. */
export function resolveReplyImage(src: string | undefined, workspace: string | null): ReplyImage {
  if (src === undefined || src === "") return NONE;
  if (isExternalRef(src)) return EXTERNAL;
  // An in-page reference can only mean a place inside the rendered Markdown, never a file.
  if (src.startsWith("#")) return NONE;
  const decoded = decode(src.replace(/[?#].*$/, ""));
  if (decoded === null) return NONE;
  const path = toWorkspaceRelative(decoded, workspace);
  return path === null ? NONE : { kind: "file", path };
}
