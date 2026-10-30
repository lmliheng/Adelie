/**
 * Makes the Markdown below Workspace-aware: a link naming a file of `workspace` opens it through
 * `onOpenFile` (the Files panel) instead of a new tab — see lib/reply-link.ts for how an href is
 * sorted — and an image whose src names one is fetched from this Session's own file route instead
 * of from the App's origin, which serves no file at all (lib/reply-image.ts). With no `onOpenFile`
 * the links keep the package's default, a new tab for every link; with no `fileUrl` the images keep
 * the src the Markdown wrote.
 *
 * Only a conversation provides it (MessageStream); every other surface — Memory, the handbook,
 * tickets — renders without it and keeps a new tab for every link and every image src as written.
 * Both resolvers are memoized on their inputs and the two enter/leave together: a context change
 * re-renders every link and image in the transcript, memoized message bodies included, so
 * `onOpenFile` and `fileUrl` have to be stable callbacks.
 *
 * `zoomable` is unconditional: in a conversation a picture is something to look at, so a click
 * opens it whole whatever its src resolved to — the resolver decides where the picture is fetched
 * from, not whether the reader may enlarge it.
 *
 * `imageActions` is asked with the same src, on the same terms, and answers what this conversation
 * can do with the FILE that src names (lib/image-actions.ts). One path is sorted once and used for
 * both questions: the picture the lightbox shows and the file an action would name have to be the
 * same file, and two copies of `resolveReplyImage`'s rules are two chances to disagree.
 */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { ProseImagesProvider, ProseLinksProvider } from "@adelie/ui";
import type {
  LightboxAction,
  ProseImageActionsResolver,
  ProseImageResolver,
  ProseLinkResolver,
} from "@adelie/ui";
import { replyLinkBehavior } from "../../lib/reply-link";
import { resolveReplyImage } from "../../lib/reply-image";

export function WorkspaceRefsProvider({
  workspace,
  onOpenFile,
  fileUrl,
  imageActions,
  children,
}: {
  workspace: string | null;
  onOpenFile: ((path: string) => void) | undefined;
  /** A URL an `<img>` can fetch for a Workspace-relative path. */
  fileUrl: ((path: string) => string) | undefined;
  /**
   * What this conversation can do with the picture at a Workspace-relative path, or `undefined`
   * when it can do nothing beyond the lightbox's own download. Kept a Workspace path rather than
   * a src: the caller that knows the Agent's Skills has no business resolving a src, and this is
   * where the src is understood.
   */
  imageActions: ((path: string) => readonly LightboxAction[] | null) | undefined;
  children: ReactNode;
}) {
  const resolveLink = useMemo<ProseLinkResolver | null>(
    () =>
      onOpenFile === undefined
        ? null
        : (href) => replyLinkBehavior(href, { workspace, openFile: onOpenFile }),
    [workspace, onOpenFile],
  );
  // An external src and one the App cannot serve both come back `null`, which keeps the src the
  // Markdown wrote — the browser's own broken-image state is the truth about the latter.
  const resolveImage = useMemo<ProseImageResolver | null>(
    () =>
      fileUrl === undefined
        ? null
        : (src) => {
            const image = resolveReplyImage(src, workspace);
            return image.kind === "file" ? { src: fileUrl(image.path) } : null;
          },
    [workspace, fileUrl],
  );
  const resolveImageActions = useMemo<ProseImageActionsResolver | null>(
    () =>
      imageActions === undefined
        ? null
        : (src) => {
            // Only a Workspace file: the Agent reads what is on its disk, and a picture fetched
            // from elsewhere would have to be downloaded first (which is a different feature).
            const image = resolveReplyImage(src, workspace);
            return image.kind === "file" ? imageActions(image.path) : null;
          },
    [workspace, imageActions],
  );
  return (
    <ProseLinksProvider resolve={resolveLink}>
      <ProseImagesProvider resolve={resolveImage} zoomable actions={resolveImageActions}>
        {children}
      </ProseImagesProvider>
    </ProseLinksProvider>
  );
}
