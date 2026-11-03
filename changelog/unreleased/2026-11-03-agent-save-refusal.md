# A refused save keeps its confirmation and says why, instead of closing on the click

- **Date:** 2026-11-03
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-03-agent-save-refusal.zh.md)

Every "save" in the Agent settings asks first, through one shared card, and confirming it starts the
write. The card used to dismiss itself in that same click: a refusal left the unsaved edit exactly
where it was, the card gone, and the reason only in a six-second notification sitting above where
the card had been. Six seconds on, nothing on the page remembered that the save had failed — the
retry was finding the Save button again. One card stands behind four forms (Overview's name and
description, System Prompt, Runtime, Tools) and two prompt writers (Memory's own, and the Skills /
Vault / Schedules sections), all with the same shape.

The card now waits for the answer: both its buttons are locked while the write is on the wire (a
second click cannot fire a rival write against the same sentence), and a refusal draws the server's
own words under the card's sentence — `ConfirmModal`'s `refusal` slot, the rule "restore the
defaults" and the model library's confirmations already follow. That sentence stays until this
write lands, and the card's own confirm button is the retry. Only a written change closes it. The
failure notification stays: this adds the account that outlives it, it does not take one away.

## Details

- `packages/web/src/features/agents/save-confirm-outcome.ts` (new): `awaitSave(run)` — a synchronous
  or asynchronous write alike (a `void`-ed promise cannot be waited on, so call sites must hand it
  back), answering `{ ok: true }` when it lands and `{ ok: false, reason }` when it does not, with
  the reason read the way every refusal slot reads one (`refusalText`: the server's answer, else a
  sentence the codebase raised itself, else the generic failure). The verdict reuses the model
  library's `WriteOutcome` (`features/models/write-outcome.ts`, already shared with the plugins
  page).
- `packages/web/src/features/agents/save-confirm.tsx`: a `busy` (write on the wire) and a `refusal`
  (the server's words), cleared when the card opens — that sentence belonged to the write that was
  refused.
- `packages/web/src/features/agents/agent-settings-page.tsx`: the four call sites hand the promise
  back (they were `requestSave(() => void onSave(...))`, and `void` left the card with `undefined`,
  as if there were no write to wait for), and the page-level `save` rethrows after its failure
  notification.
- `packages/web/src/features/agents/memory-tab.tsx` and `prompt-injection-controls.tsx`: the same
  thing for their own `.then/.catch` chains — the chain is returned, and its catch rethrows after
  the notification.

## Tests

- `packages/web/test/save-confirm-outcome.test.ts` (new, 6 cases): a landed write counts as `ok`,
  synchronous or not; a refusal carries the localized reason (a Chinese UI never shows the server's
  raw English); an unmapped code passes through as worded; a sentence the codebase raised is shown
  as it stands; a value with nothing to say falls back to the generic failure; the write runs once.
- `packages/web/e2e/agent-save-refusal.spec.mjs` (new, two cases on a real server): the System
  Prompt tab and the Memory tab, one case each — two different ways to build the promise (the
  page's shared `save` / the Memory tab's own writer). The write is refused with a 500 at
  `page.route`: the card is still there, the reason is inside it (`操作被拒绝：agent state is
  read-only`), the notification region holds no dismissible entry, and the server still holds the
  old value; seven seconds later the sentence is still there; with the refusal lifted, the same
  confirm button lands, the card closes and the server has the new value. **Counter-check**: the
  same spec against the previous build fails both cases (the card is gone right after the click).
- Adjacent regression (four specs in a real browser): `agent-config-refusal` 2 +
  `agent-switch-refusal` 2 + `memory-write-refusal` 3 + `placeholder-insert-refusal` 2 — 9 passed.

## Compatibility

- No interface, request or storage change: the same `PUT …/agents/<agent>/config`. Only where a
  refused one is drawn has moved — the card stays up and says why, instead of closing with the
  reason left to a notification.
