# 换布局不再丢掉子 Agent 输入框上方暂存的引用

- **Date:** 2026-11-19
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-19-subagent-reference-chips-across-layout.zh.md)

The Agents panel is a dock body: crossing the breakpoint (the wide window's right dock ↔ the narrow
merged surface) moves it from one mount to the other, so React unmounts it and mounts a fresh one.
Round 268 gave the child composer's text and the panel's refusal lines a record to live in across
that mount; the **reference chips** were not in it. Selecting a passage in the subagent's own
conversation and taking **Add to conversation** stages an excerpt chip above its box — after a
resize that chip was gone, and gone again after coming back, while nothing had been sent.

Now the chips are kept the same way: they are the reader's own staging, nothing was sent, so a
layout change must not unstage them. They are the one thing here that is deliberately **not**
written to the Session draft cache (see the `references` state in `chat-input.tsx`): a file quoted
ten minutes ago may have moved on, and a chip restored from storage would claim a passage the file
no longer holds — so the tab-scoped record is where they live, and they die with it.

## Details

- `packages/web/src/features/chat/subagent-composer-keep.ts`: the record gains `references`
  (`ComposerReference[]`), listed among the things the panel is not free to forget, with the reason
  the draft cache stays out of it; an empty list counts as nothing to keep, so a child with no chips
  leaves no entry behind.
- `packages/web/src/features/chat/subagents-view.tsx`: the child composer hands the record's chips
  back as `initialReferences` and writes every change through the same `remember()` the text uses.
- `packages/web/src/features/chat/chat-input.tsx`: new `initialReferences` / `onReferencesChange`
  props; every mutation (staging a chip, a chip's ×, the clear after a successful send) goes through
  one `stageReferences` and calls back, so a sent quotation cannot linger in the caller's record and
  be staged again by the next mount. The draft page passes neither and behaves as before.

## Tests

- `packages/web/test/subagent-composer-keep.test.ts`: three new cases — chips kept on their own,
  their order preserved (the message carries them in that order), and the entry dropped when the
  last chip goes.
- `packages/web/e2e/subagent-composer-across-layout.spec.mjs`: a third case stages an excerpt in
  the child's box through the panel's own selection menu, then crosses 1280 → 390 → 1280 and reads
  the chip and its × on each side; exactly one chip exists on the page (the parent's composer did
  not take the staging), and after the × it stays gone across the next move.
- Counter-proof with the same spec against the pre-change sources + build: 1 failed — the chip is
  already gone at 390. The probe reads the same two states: after — chip present at all three
  moments, above the box, `overflowX` false; before — gone at 390 and after coming back.

## Compatibility

Frontend state only: no interface, wire format or stored data changes. The chips are not written to
localStorage, so a reload does not restore them (same as before this change).
