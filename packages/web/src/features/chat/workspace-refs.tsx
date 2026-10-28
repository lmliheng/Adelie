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
 */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { ProseImagesProvider, ProseLinksProvider } from "@adelie/ui";
import type { ProseImageResolver, ProseLinkResolver } from "@adelie/ui";
import { replyLinkBehavior } from "../../lib/reply-link";
import { resolveReplyImage } from "../../lib/reply-image";

export function WorkspaceRefsProvider({
  workspace,
  onOpenFile,
  fileUrl,
  children,
}: {
  workspace: string | null;
  onOpenFile: ((path: string) => void) | undefined;
  /** A URL an `<img>` can fetch for a Workspace-relative path. */
  fileUrl: ((path: string) => string) | undefined;
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
  return (
    <ProseLinksProvider resolve={resolveLink}>
      <ProseImagesProvider resolve={resolveImage}>{children}</ProseImagesProvider>
    </ProseLinksProvider>
  );
}
