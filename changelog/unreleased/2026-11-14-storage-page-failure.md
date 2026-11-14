# The storage ledger says why it could not measure, read the mode, or scan — in one place

- **Date:** 2026-11-14
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-14-storage-page-failure.zh.md)

The **Storage ledger** page (`设置 → 存储台账`, admin only) had three failures that lost their
reason: a walk of the data root that could not be read, the read of the cleanup mode (and with it
the trash and the bills), and a scan the server refused. Each drew a sentence without the reason —
"could not read the storage report", "could not read the cleanup mode's settings", "the scan
failed" — and the server's own words went into a notification that dismisses itself after six
seconds. A page whose first promise is that nothing moves without a review has to account for the
failures of that promise where the reader is looking, and next to the control that retries them.

The three now carry the reason inside their own sentence, drawn where the control is: the walk's
under the report header (or where the report would have been), the mode's in the line under its
switch, the scan's above the bill it did not write.

The five writes on that page already had a line of their own (`storage-settings-refusal.ts`,
`storage-trash-refusal.ts`) — the mode switch, a pin, the two trash actions and an apply. Each of
them *also* raised a toast with the same words, so one refusal was said twice, one of the two
covering the top of the page for six seconds. Those five toasts are gone: the line beside the
control is the account, and the control is the retry.

## Details

- `packages/web/src/features/settings/storage-failure.ts`: new `storageFailureText(failure, reason)`
  for the three (`report` / `state` / `scan`), so the sentences live in the dictionary and each
  failure keeps its own place.
- `packages/web/src/features/settings/storage-section.tsx`: the three flags became the sentences
  themselves (`failed` / `modeFailed` / `scanFailed` are `string | null`), so the reason is what the
  page draws; the five catches that already had a slot no longer toast; every failure now goes
  through `refusalText` rather than `apiErrorText` (a condition raised before the request is sent
  shows its own sentence instead of "unknown error").
- `packages/web/src/lib/strings.ts`, `strings-en.ts`: `storageFailed` / `storageModeFailed` /
  `storageScanFailed` take the reason and say it after the part that is always true ("could not read
  the storage report: …"). The mode's sentence still says the page treats the mode as off, because
  that is what it does, and every control the mode gates is inert for that reason.

## Tests

- `packages/web/test/storage-failure.test.ts`: each of the three names its own failure, the reason
  travels verbatim, the three sentences are distinct, and both languages.
- `packages/web/e2e/storage-page-failure.spec.mjs`: a real server and a real browser, one case per
  failure — the sentence is on the page, the notification region holds no button, it is still there
  after seven seconds, and the same control (measure again / scan again) lands once the stub is
  lifted. Run against the previous build, all three fail on the missing sentence.

## Compatibility

No API change, no new dependency, no config change. The page's own wording gained the server's
reason; the notifications those failures used to raise are gone.
