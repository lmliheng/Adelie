# A refused Save on the security-policy page says which policy is still in force

- **Date:** 2026-11-14
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-14-command-policy-save-refusal.zh.md)

One Save on Project settings → Security policy PUTs the whole `[command_policy]` block — the master
switch and every rule — so a refusal leaves the controls on screen showing a state the engine is
not running: the reader who just switched command blocking off believes the next command runs
unguarded, and the reader who just added a deny rule believes it is enforced. The refusal was a
notification carrying the error's own words and nothing else, and it was gone six seconds later —
leaving a list that looked saved. That is the rule every write refusal in the app follows (the
sentence belongs where the attempt was made), and the security-policy page was the last one in
Project settings still sending a toast.

The sentence now sits in the Save button's own row, and it says what the Project still enforces:
with the master switch part of the attempt it names the state that stays in force (blocking still
on, or still off, with the rules from the last save); with only the rule list touched it says the
stored policy is untouched and never claims the switch moved. Each attempt clears the sentence
from the attempt before it, and the Save button is still the retry.

The rule list is the one thing here a reader can overflow without being told: the route caps a
policy at 64 rules and the page neither says so nor stops at it. That is how the refusal is
reachable — and what the sentence is worth, since a 65th rule silently missing from the file is
exactly the state this page used to leave unexplained.

## Details

- `packages/web/src/lib/command-policy-save-refusal.ts` (new): `commandPolicySaveRefused(attempt,
  error)` — `{ enabled, savedEnabled }` plus the sentence, read through `refusalText` (an answer
  the server gave is spoken through its code's own localized words; a failure this codebase raised
  is shown as written). The attempt comes back with the sentence so a caller can tell which of the
  three cases it was.
- `packages/web/src/components/layout/project-dialogs.tsx`: `SecurityPolicySection` keeps the
  sentence in a `saveRefusal` slot instead of calling `toastError`, clears it at the start of every
  attempt, and drops it when the dialog switches Project. The sentence is drawn `role="alert"`
  (`data-testid="command-policy-refusal"`, two lines max, the whole text on hover) beside the Save
  button — in the button's own row, not stacked above it: the rule list alone overflows this
  dialog's scroll box, and a sentence over the button pushed the retry out of view exactly when it
  was needed.
- Dictionaries (`strings.ts` / `strings-en.ts`): three sentences — the switch still on, the switch
  still off, and the stored policy untouched.
- No API change, no new dependency, no server-side behaviour change.

## Tests

- `packages/web/test/command-policy-save-refusal.test.ts` (new, 6 cases): a refused switch-off says
  blocking is still on; a refused switch-on says it is still off; an untouched switch is never
  reported as flipped; a mapped error code is spoken in the interface's own words instead of the
  wire message; a value with nothing to say falls back to the generic text; the sentence follows
  the active dictionary.
- `packages/web/e2e/command-policy-save-refusal.spec.mjs` (new, 2 cases, real server + real
  browser): the Project holds 64 rules (the route's ceiling) and the draft adds the 65th through
  the form — with the switch also switched off, the sentence names the engine's state and the
  server's own reason, nothing lands in the notification region, the stored policy is still the
  64 rules it was, and the sentence is still there after seven seconds; the same button then lands
  the save once the list is back under the ceiling. A refused rule-list edit alone claims neither
  switch state, and the stored policy is byte-for-byte the earlier read.

## Compatibility

No wire change: the same PUT, the same validation. What changes is what a refused Save tells the
reader, and it tells it next to the control that asked.
