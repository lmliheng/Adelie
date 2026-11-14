# A refused update check says why in the modal, and the button that retries it stays there

- **Date:** 2026-11-14
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-14-update-check-refusal.zh.md)

The **Software update** dialog (`软件更新`) makes a "check for updates" request of its own: on opening
(nothing known yet, or the last answer stale) and every time the reader presses "check now". When that
request was refused — our own server unreachable, or answering 5xx — nothing in the dialog changed: a
previous answer went on being shown, and with no answer yet the body **kept spinning "正在检查更新…"
indefinitely**, while the only account of the failure was a toast that is never raised while the
dialog is open (`if (!quiet())`).

It now goes through the same refusal slot as "download and update" and "restart and update": the
sentence sits at the end of the body, immediately above the footer button that retries it, stays until
the next attempt, and names its step — "could not check for updates — no answer this time: …". It is
**not** the flow's own `error` state: that one means the server answered, having run the lookup and
failed. Here the request never got an answer at all, so "the update check failed" would be vouching
for a reply nobody gave.

When nothing is known (the load-time check was refused too) the body no longer spins — no answer is
coming, and the sentence is the whole account — and the footer gains the "check now" button the
sentence points at. In the desktop shell the same refusal lands in the same slot (reason through
`apiErrorText`), kept apart from "the shell reports a failed check": that one is an answer, and the
body has a place for it already.

## Details

- `packages/web/src/lib/update-request-refusal.ts`: `UpdateRequestStep` gained `check`; the module
  comment draws the line between it and the flow's `error` state.
- `packages/web/src/lib/use-update-flow.ts`: `checkForUpdates()` clears the slot on every attempt
  (7.19's rule) and routes a refused release-mode check through `refuseRequest("check", e)`; the
  owner writes the client-side `refused` settle into the same slot (toast only while the modal is
  closed, the sentence naming the step either way).
- `packages/web/src/lib/desktop-update.ts` / `use-desktop-update.ts`: the settle union gained
  `refused` (reason from `apiErrorText`), distinct from the shell's own `failed`.
- `packages/web/src/components/account/update-modal.tsx`: with a refusal and an `unknown` flow the
  body draws no spinner, and the footer offers "check now".
- `packages/web/src/lib/strings.ts`, `strings-en.ts`: `checkRefused(reason)`.

## Tests

- `packages/web/test/update-request-refusal.test.ts`: the `check` sentence does not impersonate
  `checkFailed`, carries the reason verbatim, the three sentences differ, and both languages.
- `packages/web/e2e/update-check-refusal.spec.mjs`: a real server and a real browser, two cases —
  ① with nothing known, opening the dialog (its automatic check refused): the sentence is in the
  modal, `role="alert"`, no spinner, no button in the notification region, still there after seven
  seconds, and the footer's "check now" lands on "新版本 v9.9.9 可用" once let through; ② with a
  previous answer, pressing "check now" and being refused: the sentence is there, the previous answer
  stays exactly where it was, still there after seven seconds, and the retry replaces it. Run against
  the previous build, both fail on the missing sentence.

## Compatibility

No API change, no new dependency, no config change. In the desktop shell the wording of the toast for
a refused check changed to this sentence (the one raised while the dialog is closed); every other
notification is unchanged.
