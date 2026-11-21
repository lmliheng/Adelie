# A refused Save in the organization settings now says why on the footer row, beside the button

- **Date:** 2026-11-21
- **Type:** fix
- **Scope:** `web`

Saving an organization's settings can be refused by the server — the resume / pause button is a PATCH
of its own and can be refused the same way — and the dialog stays open either way. The reason did not:
it fell into a toast that dismissed itself after six seconds and floated over the box rather than in
it. A reader who looked back a moment later saw the draft exactly as they had typed it, the Save button
where they left it, and nothing that said the write had been refused (7.19's rule: the sentence
belongs where the attempt was made, and that button is the retry).

The server's words now stay on the dialog's footer row, to the left of Cancel and Save
(`role="alert"`, danger colour, two lines, the whole sentence on hover), until the next attempt, a
successful one, or a fresh open of the dialog — the body scrolls, so a line stacked under the last
field would land below the fold right where Save was pressed.

## Details

- `packages/web/src/features/company/org-dialogs.tsx`: `OrganizationSettingsDialog` gained
  `saveRefusal`; `patch()` (the one path behind Save and pause / resume) records `apiErrorText(e)`
  there instead of calling `toastError`, and clears it when an attempt starts and when the settings
  load afresh, so a reopened dialog never carries the last attempt's reason. The successful path is
  unchanged.

## Tests

- `packages/web/e2e/org-settings-refusal.spec.mjs` (new, 2 cases, real server + real browser, the PATCH
  refused by `page.route` with its own 500):
  ① rename → Save → the sentence is in the dialog, absent from the notifications region, the draft is
  still there and the server still holds the old name; **still there after seven seconds**; Cancel and
  reopen does not carry it; the retry lands and the dialog closes with the new name on the server;
  ② pause → the sentence names the same refusal, the server still reads `active`, and the retry is
  the same button, after which it reads `paused`.

## Compatibility

Renderer only: no API, wire format or stored data changed, and the server is untouched.
