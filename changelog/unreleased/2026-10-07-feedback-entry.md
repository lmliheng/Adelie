# Web: a feedback entry in the account menu, filed straight into the install's queue

- **Date:** 2026-10-07
- **Type:** feature
- **Scope:** `web`, `server`, `ui-gallery`

[中文版](2026-10-07-feedback-entry.zh.md)

The bottom-left account menu gained a **反馈 / Feedback** row that opens a two-field dialog — a
one-line title and an optional detail — and files what the user typed into the install's feedback
queue. The answer comes back as a toast naming the item the queue created.

## Where the words go

- The install names its queue with `ADELIE_FEEDBACK_URL`; the credential it wants, if any, is
  `ADELIE_FEEDBACK_KEY`. Both are read at startup like the rest of the deployment environment, and
  the address must be an absolute `http(s)` URL with no credentials in it (the key has its own
  variable, so it does not end up in a logged request line).
- The browser never learns either one. `GET /api/feedback` answers `{ok, configured}` alone, and
  the row is drawn only where that is true — an install with nothing to send to offers no button
  that can only fail. The submission itself goes to `POST /api/feedback` and the server forwards
  it to the configured endpoint as the box's own `POST /api/requirements` body, `{title, detail}`,
  with the key as its `x-adelie-key` header. The item then sits in the same queue that queue's
  page lists and the patrol rounds read their work from.
- The title is required and capped at 200 characters, the detail at 20000 — the endpoint's own
  limits, applied before the hop so an over-long submission is answered in place.
- Failures are named for what the user can do about them: a submission with no endpoint
  configured (the operator turned it off under an open dialog) says so, everything else is one
  retryable sentence. A rejection or an unreachable endpoint is reported as this server's own
  failure with the status code — the far end's error text is written for the operator, and is not
  relayed to whoever is typing.

## The demo gallery

`packages/ui-gallery` answers both routes as an install that has a queue behind it, so the row and
its dialog can be reviewed on the component gallery without a server.
