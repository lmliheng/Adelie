# A refused switch, placeholder insert or save is explained once, not twice

- **Date:** 2026-11-11
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-11-refusal-no-duplicate-toast.zh.md)

The Agent settings page answers a refused write where it was asked: the enable switch at the head of
each tab keeps the server's words under its card, the "insert the placeholder" strip keeps them
under the strip, and the confirm-before-save card keeps them inside the card that retries. Every one
of those surfaces arrived during the long pass that moved a refusal out of a six-second
notification and into the control that asked (7.19's rule), and each of them left the old
`toastError` in place beside the new sentence. So the app said the same thing twice: once where the
person was looking, and once in a notification above the page that then vanished on its own.

This change removes the second copy — seven call sites in three files. A toast still announces every
write that **landed** (the switch moves without saying anything, so that is the only account of a
success); it is only a refusal that has a place of its own that no longer also raises one. Nothing
else about the surfaces changes: the sentences, their slots, their clearing rules and every retry
are the same.

## Details

- `packages/web/src/features/agents/memory-tab.tsx`: the Memory switch (`switchRefusal`), Memory's
  placeholder strip (`insertRefusal`) and the tab's own prompt writer (the save card) no longer call
  `toastError`. Opening a memory keeps its toast: that read has no surface to stay in — the panel
  never got as far as opening — so the notification is still the only account of it.
- `packages/web/src/features/agents/prompt-injection-controls.tsx`: the same three, for the switch,
  the strip and the prompt writer the Skills / Vault / Schedules / Hooks tabs share.
- `packages/web/src/features/agents/agent-settings-page.tsx`: the page's shared `save`, which every
  settings form reaches through `useSaveConfirm`, rethrows to the card without also toasting.
- The comments where each copy used to be say why: the in-place line is the whole account, and a
  copy of it that dismisses itself after six seconds only adds noise above the card it came from.

## Tests

- `packages/web/e2e/agent-switch-refusal.spec.mjs`, `placeholder-insert-refusal.spec.mjs`,
  `agent-save-refusal.spec.mjs`: the "no notification" assertion is now an immediate read
  (`expectNoToast`) instead of `toHaveCount(0)`. The retrying form also passed against a toast that
  simply expired after six seconds — which is exactly the behaviour these files are about — and it
  is why every case used to take fifteen seconds.
- `agent-save-refusal.spec.mjs` gains a case for the shared prompt writer (the Skills tab's prompt
  section), a third shape of the save promise that no browser test covered before.

## Compatibility

No interface change on the wire, no new dependency, no Project config change. Success notifications,
the refusals' own sentences, the delete / import / export surfaces and the Memory tab's read refusal
are unchanged.
