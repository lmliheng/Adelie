# A refused Trace import says why in its own row, instead of in a toast that expires

- **Date:** 2026-11-01
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-01-trace-import-refusal.zh.md)

Settings → General → 「Import Trace」 is one row of three controls — the Project, the Agent and the
file pick — and every way that row can fail used to report itself in a toast that dismissed after six
seconds. A refused import writes nothing: the pickers stay exactly where they were, and picking a
file again is the retry. So the reason belonged to the row that had just done nothing, and the toast
left the reader looking at a row that seemed untouched — unable to tell a duplicate Session from a
malformed file, from a file that was simply too large.

The row now draws the sentence under its pickers, in the danger ink, as a `role="alert"` clamped to
two lines with the whole of it on hover, and the sentence stays until the next attempt starts. All
three failures land there: the server's refusal (a Session id this install already has, a file whose
first record is not `session_meta`), a file past the ceiling for its kind, and a file the browser
failed to read. No new copy was written — the server's answer goes through the shared
`refusalText()`, and the ceiling sentences already existed.

## Details

- `packages/web/src/features/settings/trace-import-row.tsx`: a `refusal` state, filled by all three
  failure paths instead of `toastError` and cleared when another file is picked (the sentence about
  the last attempt is stale from that moment on). The pickers and the sentence share one column, so
  the sentence is drawn under the pick it was about.
- `traceImportSizeRefusal(fileName, sizeBytes)` — which ceiling a picked file answers to (14MB for a
  `.jsonl` Trace file, the server's 48MB for a whole-Session `.json` bundle) — is now a function of
  its own, judged on the file's name and size rather than on its bytes, so a 40MB file is never read
  into memory to be told it is too large.

## Tests

- `packages/web/test/trace-import-row.test.ts` (new, four unit cases): a Trace file is let through up
  to its own ceiling and refused one byte past it; a bundle of 20MB is read, and one past 48MB is
  refused with the bundle's sentence; a 48MB+ Trace file still gets the Trace sentence rather than
  the bundle's; the extension decides case-insensitively, and a name the picker does not offer gets
  the smaller ceiling rather than a pass.
- `packages/web/e2e/trace-import-refusal.spec.mjs` (new, two browser cases against the real server):
  a Trace imported twice leaves the route's own 409 on the row — nothing in the notification area,
  still there seven seconds later, the destination pickers unmoved — and the next pick clears it and
  lands a second Session; a `.jsonl` one byte past 14MB is refused in place with no upload request
  sent at all, and a file that fits still lands afterwards.

## Compatibility

- No API or request change: the row sends the same `{dataBase64}` to the same route and reads the
  same answers. Only the failed paths stopped using a toast.
