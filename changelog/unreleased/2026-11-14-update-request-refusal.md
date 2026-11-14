# The update modal says why its own two requests were refused — in the modal, above the button

- **Date:** 2026-11-14
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-14-update-request-refusal.zh.md)

The **Software update** dialog (`软件更新`) makes two requests of its own: "download and update" starts
the self-update job (or asks the desktop shell for the download), and "restart and update" restarts
into the release that job installed. Both were refused with a single toast — "could not run the
update action: …" — floating over the very dialog that holds the button which was pressed, while the
dialog went on showing the release on offer (or the restart it was waiting for) exactly as it had
before. Six seconds later the reason was gone and the reader was left looking at a button they had
just pressed, with no account of what came back. The flow's own failures (a job that ran and failed,
a lookup that answered with an error) already had a place in the modal's body; these two did not.

The refusal now stays inside the modal, at the end of the body, immediately above the footer whose
button retries it — and it stays until the next attempt. Each sentence names its own step, because
the two consequences differ: a refused download means nothing was fetched at all, a refused restart
means the new version is installed but not running yet. The reason is whatever the app already
localized for an error (`apiErrorText`), carried verbatim. A toast is still raised in the one window
where the request was already on the wire and the dialog got closed — a reason never disappears just
because its host went away.

## Details

- `packages/web/src/lib/update-request-refusal.ts` (new): `updateRequestRefused(step, reason)` for
  the two steps (`download` / `restart`), so the sentences live in the dictionary and each step keeps
  its own wording.
- `packages/web/src/lib/use-update-flow.ts`: the flow store gained `requestRefusal` (the sentence
  itself, `string | null`); `downloadUpdate` / `installUpdate` write it instead of toasting, through
  one `refuseRequest` that keeps the toast for the closed-dialog window; every new attempt, opening
  and closing the modal clear it (7.19's rule for every refusal slot).
- `packages/web/src/components/account/update-modal.tsx`: the modal renders that sentence as a
  `role="alert"` line at the end of the body — right above the footer's buttons — clamped to two
  lines with the whole text one hover away.
- `packages/web/src/lib/strings.ts`, `strings-en.ts`: `requestFailed` (one sentence for both steps)
  became `downloadRefused` / `restartRefused`, each saying which half was refused and what that
  means.

## Tests

- `packages/web/test/update-request-refusal.test.ts`: each step names its own refusal, the reason
  travels verbatim, the two sentences differ, and both languages.
- `packages/web/e2e/update-request-refusal.spec.mjs`: a real server and a real browser, one case per
  request — the sentence is in the modal, the notification region holds no button, it is still there
  after seven seconds, and the same button lands once the stub is lifted (the download's job answers
  "not launched via the CLI", the restart answers "no supervisor" — this server, so nothing is
  spawned or restarted). Run against the previous build, both fail on the missing sentence.

## Compatibility

No API change, no new dependency, no config change. The modal's wording gained the reason and says
which step it was; the notifications those refusals used to raise are gone.
