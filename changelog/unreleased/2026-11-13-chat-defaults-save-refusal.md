# A refused Save in Project settings says which half the Project took

- **Date:** 2026-11-13
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-13-chat-defaults-save-refusal.zh.md)

One Save on Project settings → New chat defaults is up to TWO writes: the `[default_chat]` block
(agent / working directory / approval mode / thinking level) and then the Project's default model.
They go out in that order, so the second can be refused after the first has already landed — and
the refusal was a notification carrying the error's own words and nothing else. A Save whose block
HAD been stored then read exactly like one that never got anywhere, and that sentence was gone six
seconds later, leaving a reader to guess which half of the form the Project now holds. That is the
rule every write refusal in the app follows (the sentence belongs where the attempt was made), and
this section was the next place still sending a toast.

The sentence now sits under the controls that asked, and it names the half the Project took: a
refused block says the defaults are still the old ones, a refused model write after the block
landed says the defaults were saved but the model is still the old one, and a refused model write
on its own says only that — it never claims the defaults were saved. Each attempt clears the
sentence from the attempt before it, and the Save button is still the retry.

## Details

- `packages/web/src/lib/chat-defaults-save-refusal.ts` (new): `chatDefaultsSaveRefused(attempt,
  error)` — `{ write: "defaults" | "model"; defaultsLanded: boolean }` plus the sentence, read
  through `refusalText` (an answer the server gave is spoken through its code's own localized
  words; a failure this codebase raised is shown as written). The attempt comes back with the
  sentence, because which write it was is what decides what the Project now holds.
- `packages/web/src/components/layout/project-dialogs.tsx`: `ChatDefaultsSection` tracks which of
  the two writes the attempt is on and whether the block already landed, and draws the sentence
  under the grid (`data-testid="chat-defaults-refusal"`, `role="alert"`, danger ink, two lines
  with the full text on hover); the `toastError` on this page is gone. Both writes, their order
  and what lands are untouched.
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: `chatDefaultsRefused`,
  `chatDefaultsModelRefused` and `chatDefaultsModelRefusedAfterSave`, in both dictionaries.

## Tests

- `packages/web/test/chat-defaults-save-refusal.test.ts` (new, 6 cases): a refused block says
  nothing was saved and speaks the server code's own words; a refused model write after the block
  landed says which half the Project took; the same refusal without the block never claims a save;
  a failure raised before the request keeps its own words; a value with nothing to say falls back
  to the generic text; the active dictionary decides the language.
- `packages/web/e2e/chat-defaults-save-refusal.spec.mjs` (new, 2 cases, real server + a real
  browser, both refusals the server's own): with both halves dirty and the picked model removed
  from the Project meanwhile (what another tab's models page does), the default-model route
  answers 400 — the sentence says the defaults were saved, names the refused model, the block is
  really stored while the default model is really unchanged, nothing lands in the notification
  region, the sentence is still there after seven seconds, and the same button lands the model
  half once the row is back; with only the model changed, the sentence says just that, the stored
  block is byte-for-byte the read from before, and the same button retries it.
- Against the section as it was before the change (rebuilt from `HEAD`'s
  `project-dialogs.tsx`), both cases fail on the missing refusal line; a two-state probe on the
  same page reads one notification at 1.2 s — the bare `defaultModel must be included in models:
  …` — and an empty screen at 7.5 s (while the block write had landed server-side), against the
  sentence at both moments after the change.

## Compatibility

No API change, no new dependency, no stored format change. A Save whose writes both land behaves
exactly as before; what changed is a Save that only half lands — it can no longer look as if none
of it did.
