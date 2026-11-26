# A big attachment no longer rides inside the message body

- **Date:** 2026-11-26
- **Type:** feat
- **Scope:** `server`, `web`

[中文](2026-11-26-attachment-direct-upload.zh.md)

A message's attachments used to travel **inside** the request body as base64, which is why a 177MB
file was a ~236MB body out of one `fetch`: the browser could only say "sent" once all of it was
gone, and a slow link meant minutes of a disabled composer (and the timeout in front of it). Large
files now go out on their own: the composer uploads each one to the Session's scratchpad first,
and the message carries a small part naming the file it landed as.

The split is at 2MB (`DIRECT_UPLOAD_MIN_BYTES`): anything bigger takes the direct route, everything
else stays inline exactly as before, so a screenshot or a short log file costs no extra round trip.

## Details

- `POST /api/sessions/:sessionId/attachments?name=…` (new): the body is the raw bytes
  (`application/octet-stream`), streamed to disk as they arrive; the per-file cap is judged on the
  bytes received, so an over-limit upload is cut off with `413` and its half-written file removed —
  never buffered whole in memory. An empty body is `400`, success is `201` with
  `{fileName, path, bytes}` (`packages/server/src/http/routes/sessions.ts`).
- `services/task-attachments.ts`: a `TaskAttachment` is now either `inline` (as before) or
  `uploaded { fileName, path }`. `receiveAttachment` writes into the Session's scratchpad,
  `resolveUploadedFile` accepts only a regular file (no symlinks, `lstat`-checked) sitting directly
  in that Session's scratchpad — a path from another Session, or from outside it, is refused.
  `assertAttachmentBudget` counts only inline bodies; `assertTotalBytes` adds the uploaded ones.
  `attachFilesToInput` measures everything before it writes anything, and returns what it wrote so
  a failed turn can take it back.
- `packages/web/src/lib/upload-limits.ts` (new): `DIRECT_UPLOAD_MIN_BYTES` and `splitByTransport`.
- `packages/web/src/features/chat/message-upload-progress.ts`: `ComposerFile` is
  `inline | direct | uploaded`; `resolveComposerFiles` uploads the direct ones one by one, each with
  its own progress card, and `filePartsOf` turns the result into the parts the message carries.
- The upload happens **at send time**, once the Session id exists (a draft's first message creates
  the Session first) — so a failed upload fails that send, the reason shows above the input card,
  and the draft and its attachments stay put for the retry.

## Compatibility

Inline attachments still travel exactly as before, and `packages/docs/content/chat.{zh,en}.md`'s
attachment section says which way a file goes. The Session's scratchpad is where an uploaded file
lives, so it is deleted with the Session. A recalled uploaded file is not read or re-sent — the
recall line names it with its size instead.
