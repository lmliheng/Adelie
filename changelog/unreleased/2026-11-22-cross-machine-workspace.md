# A Session imported from another machine can be continued

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `core`, `server`

[中文](2026-11-22-cross-machine-workspace.zh.md)

A Trace moved in from another installation (or a Session whose temporary Workspace the local cleanup
took) could not be sent to again: recovery looked for the Workspace path recorded in the Trace, which
belongs to **that** installation, and answered `The original Session's Workspace no longer exists: …;
cannot resume.`

Two kinds of Workspace are now judged differently. A **temporary** one — the `workspaces/tmp-<8hex>`
an Automatic Session was given because it was named no directory — is recreated here under the same
name: nothing of the user's was in it, and without that the migrated Session could never be continued.
A directory the user named is **never touched**: the files in it are theirs, and a Session silently
running somewhere else is worse than one that refuses — a missing one still fails the resume, now
with the `workspace_missing` reason the interface already has a sentence for instead of English.

## Details

- `packages/core/src/internal/session-support.ts`: new `isTemporaryWorkspace()` and
  `adoptTemporaryWorkspace()` (recursively creates the same-named directory under this install's
  `workspaces/`, idempotent); `createTempWorkspace` now uses the same constants.
- `packages/core/src/agent.ts`: new exported `WorkspaceGoneError`; `resumeSession` recreates a missing
  Workspace only when it is temporary and throws otherwise (the pre-existing "not a directory" error
  is kept).
- `packages/core/src/index.ts`: the barrel exports `WorkspaceGoneError`.
- `packages/server/src/runtime/session-manager.ts`: the resume path turns that error into
  `HttpError(409, "workspace_missing")`, so the interface shows its own localized sentence.
- `packages/docs/content/sessions-and-traces.{zh,en}.md`: the recovery section states how the two
  kinds of Workspace differ, and the migration section says what happens to an imported Session.

## Tests

- `packages/core/test/resume.test.ts` (+2, one renamed): a missing temporary Workspace is recreated
  here; a Workspace the user chose is **not** auto-created (PRN-004).
- `packages/server/test/session-loader.test.ts` (1 changed, 1 added): a user-chosen directory that is
  gone answers `409 workspace_missing`; another installation's temporary Workspace is recreated here
  and then loads.

## Compatibility

One optional behavior and one error type; the data root, the Trace format and the API shapes are
unchanged.
