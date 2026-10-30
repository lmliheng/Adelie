# A picture in a reply now offers the two things the Agent can do with it

- **Date:** 2026-10-30
- **Type:** feature
- **Scope:** `web`, `ui`
- **Breaking:** no

[中文版](2026-10-30-reply-picture-actions.zh.md)

Opening a picture in a conversation used to offer saving it and stepping through the batch, nothing
else: the reader could see the picture, and to have anything made from it they went back to the
composer and typed its path by hand. The lightbox's capsule bar now carries two more buttons —
**Split into layers** and **Redraw from this one** — with the picture's own path filled in, so
nobody copies it out of the transcript.

Neither action is a request this App makes against an endpoint of its own: the repository has none,
and the model, the credential and the file all live on the Agent's side, so an action is **a
sentence handed to the Agent**. Splitting into layers is one Seedream call with fixed options
(`--layers`), so it goes out at once as a message of the user's own and the reply carries the base
image plus every transparent layer PNG. What a redraw should change is the user's to say, so that
one only puts the instruction — the picture named as its reference image — in the composer, and
pressing Send stays their move: generation is billed per image, and no tap read as "redo this"
should buy one.

An Agent without the image Skill (`seedream`, installable from `@adelie/use-seedream`) is offered
neither button. A control that can only fail is worse than no control — the rule the bar started
with.

## Details

- `packages/ui/src/components/overlays/lightbox/lightbox.tsx`: `LightboxAction` (`key` / `label` /
  `onSelect`) becomes an optional `actions` on `Lightbox` and `ZoomableImage`, drawn in the capsule
  bar after the download. Selecting one closes the overlay and then runs it — an action usually
  lands on the page underneath (a sentence in the composer, a turn for the Agent), and doing that
  under a scrim leaves the reader looking at the picture they just acted on.
- `packages/ui/src/components/content/prose/prose.tsx`: `ProseImagesProvider` takes an optional
  `actions` resolver (`ProseImageActionsResolver`), shaped like the image and link resolvers beside
  it, and `MdImage` hands its answer to the lightbox. It is asked with the src **as the Markdown
  wrote it**, not with the URL the image resolver produced: the surface above recognizes a file by
  that src, and a file route's URL is nothing it can use.
- `packages/web/src/lib/image-actions.ts` (new): `hasSeedreamSkill` and `replyImageActionBuilder`.
  Pure logic — both actions are wired here, with the words passed in from the active dictionary, so
  each language stays in one place.
- `packages/web/src/features/chat/workspace-refs.tsx`: the conversation gains a resolver answering
  what can be done with a picture by Workspace path, sorted through the same `resolveReplyImage` as
  the fetch (one path sorted twice is two chances to disagree).
- `packages/web/src/features/chat/chat-page.tsx`: the Agent's Skill list is already loaded for the
  composer, and it is what decides whether the buttons appear at all. Split into layers posts
  straight through `api.postTask(..., { queueIfBusy: true })` without disturbing the draft being
  typed; the redraw goes through `ComposerControl.fillPrompt` with `seedream` pinned, so Send
  builds the same `[use_skills]` message the one-click action would have posted.
- `packages/web/src/features/chat/message-stream.tsx`: the render context carries `imageActions`
  down to the Markdown.
- `packages/web/src/lib/strings{,-en}.ts`: `chat.imageAction` — the two buttons' words and the
  sentence each carries (the instruction IS the message, so it follows the interface's language).
- Tests: `packages/web/test/image-actions.test.ts` (new: the Skill gate, both buttons' names and
  destinations, the `[use_skills]` wrapping, the path carried through verbatim),
  `packages/ui/test/lightbox.test.ts` (the buttons in the bar, an unchanged bar when nothing is
  offered, close-then-run), `packages/ui/test/prose.test.ts` (the resolver is asked about the src as
  written), `packages/web/e2e/reply-picture-actions.spec.mjs` (new — a real browser: an Agent
  without the Skill gets no buttons, and once it has them a click closes the overlay and leaves the
  instruction, path and all, in the composer, while the layer split goes out as a message carrying
  the Skill's own `[use_skills]` mark).

## Compatibility

- No API, on-disk or protocol change. An Agent without the image Skill, and every Markdown surface
  that is not a conversation, behaves exactly as before: a picture is still only enlarged and saved.
