# A reply's picture is fetched from the Workspace, not from the App's own origin

- **Date:** 2026-10-29
- **Type:** fix
- **Scope:** `web`, `ui`
- **Breaking:** no

[中文](2026-10-29-reply-image-from-workspace.zh.md)

A model names the pictures it made the way a README would — `![预览](shot.png)`, relative to the
Workspace it works in. A conversation rendered that src as written, so the browser resolved it
against the App's own route (`/chat/shot.png`, a page that does not exist) and every Workspace
picture in a reply was a broken image. The image plugin shipped last round went further and told
the agent never to use Markdown image syntax at all, because the only way to see a generated
picture was to open it in the Files panel.

Inside a conversation an image src is now sorted the way a link already was. One that names a
Workspace file is fetched from that Session's own file route, so the picture renders in the
transcript (and on a Session that lives on a machine, from that machine). One that names another
site keeps its own src, and one that resolves to nothing — a `..` climbing out of the Workspace, a
`~` path, an emptied src — stays exactly as written, the browser's broken-image state being the
truth about it.

## Details

- `packages/ui/src/components/content/prose/prose.tsx`: `ProseImagesProvider` / `ProseImageResolver`
  and the `img` adapter, the same shape as the link resolver beside it. With no resolver above, an
  image keeps the src the Markdown wrote, so every surface that renders a README, a handbook page or
  a document is unchanged. An empty src renders no `src` attribute at all (rather than `src=""`,
  which asks the browser for the page itself).
- `packages/ui/src/components/content/prose/prose.css`: `.md-body img` — the reading column is the
  widest a picture may get, with its aspect ratio kept, so a 2000px screenshot does not widen the
  transcript.
- `packages/web/src/lib/reply-image.ts`: `resolveReplyImage` — the pure rule, `external` / `file` /
  `none`, reusing `toWorkspaceRelative` and the scheme test the link resolver uses (`isExternalRef`,
  now exported from `lib/reply-link.ts` rather than written twice).
- `packages/web/src/features/chat/workspace-refs.tsx` (was `workspace-links.tsx`): the conversation
  provides both resolvers; it names itself after what it now does. `MessageStream`'s render context
  gained `workspaceFileUrl`, which `chat-page.tsx` builds from the Session's id — absent while
  drafting, where there is no Session whose files could be read.
- `plugins/use-seedream/skills/seedream/SKILL.md`: the "handing the result over" section now asks
  for the picture itself instead of telling the agent that image syntax does not resolve.
- Tests: `packages/web/test/reply-image.test.ts` (the rule), `packages/web/test/md.test.ts` (what
  reaches the DOM through the real pipeline), `packages/ui/test/prose.test.ts` (the adapter and its
  default), `packages/web/e2e/reply-image.spec.mjs` (a real browser: the picture decodes, the other
  two srcs are untouched) with a branch in the e2e mock model.

## Compatibility

- No API, on-disk or protocol change. A Markdown surface outside a conversation renders exactly as
  before; only a reply's images are fetched from a different URL, and that URL is the one the Files
  panel has always used.
