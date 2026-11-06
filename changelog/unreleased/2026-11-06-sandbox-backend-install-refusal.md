# A sandbox-backend install that did not land keeps its prompt open, with the reason and the retry

- **Date:** 2026-11-06
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-06-sandbox-backend-install-refusal.zh.md)

The Sandbox card in Settings offers to install this OS's default sandbox backends the moment its
switch is turned on over a machine that reports none. That install can end without the machine
getting a backend: a package the server did list but the process could not load, or a request that
never got an answer (the packages after it are not tried). The dialog used to close as soon as the
request left, and the only account of the failure was a notification that dismissed itself after
six seconds — over a card still reading "no backend for this OS".

The prompt now closes on a run that installed everything, not on the request. When something is
left behind it stays open with the reason under its own question (`role="alert"`, the server's
words for a package that would not load, the error code's localized sentence for a request that
failed), names the packages still missing, and offers only those — its own Install button is the
retry, and retrying does not install again what already landed, because every install reloads the
server's plugins and stops agent runs in progress. The card's live parts are read again either way,
so what did install shows.

## Details

- `packages/web/src/features/settings/sandbox-backend-refusal.ts` (new):
  `backendInstallRefusal(failures, stopped, remaining)` — the pure decision, so which sentence
  appears is in one place and testable without the page.
- `packages/web/src/features/settings/plugins-section.tsx`: `installOffered()` collects the run's
  failures instead of toasting them, re-reads the card's live parts, and closes the prompt only
  when nothing is left; otherwise it narrows the offer to the missing packages and keeps the
  sentence. The "no Project" precondition also stays in the prompt now (it had the same six-second
  problem).
- `packages/web/src/features/settings/sandbox-backend-prompt.tsx`: one new `refusal` prop, drawn
  in `ConfirmModal`'s refusal slot under the question.
- `packages/web/src/lib/strings{,-en}.ts`: a new pair, `sandboxBackendPrompt.installStopped(reason)`
  and `sandboxBackendPrompt.installRefused(reasons, missing)`.

## Tests

- `packages/web/test/sandbox-backend-refusal.test.ts` (new, 8 cases): nothing to say when every
  package installed; a package that would not load is quoted in the server's words; a request that
  never answered is read through its code's localized sentence, never the wire's English; only the
  missing packages are named; a reason that already ends a sentence does not double its full stop;
  several reasons are kept; a value this codebase raised is shown as it wrote it; the active
  language is followed.
- `packages/web/e2e/sandbox-backend-install-refusal.spec.mjs` (new, 3 cases, real server + real
  browser): with the install stubbed to `internal`, the prompt stays open with the sentence and no
  toast carries it, **7 seconds later** it is still there with a live Install button, and pressing
  it again lands the package and closes the prompt; a package that installed but would not load is
  quoted in the server's words; a two-package run that stopped on the second offers only the
  second, and the retry posts only that one.

## Compatibility

No API, wire format or stored data changes; no new dependency. Which words appear for an error code
is unchanged (`refusalText`, 7.19's rule).
