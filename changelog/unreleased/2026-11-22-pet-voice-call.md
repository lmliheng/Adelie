# The desktop pet can take a call

- **Date:** 2026-11-22
- **Type:** feature
- **Scope:** `server`, `web`, `desktop`

[中文](2026-11-22-pet-voice-call.zh.md)

The pet panel has a new row, 「语音通话」. Pressing 「打电话」 grows the window from 260×248 to a
320×420 call surface, and from there the conversation is spoken: the model's answer is played as it
is generated, its words appear as they are said, the user's are transcribed while they are being
said, and talking in the middle of a reply cuts that reply off where it stands — kept as a turn
marked interrupted rather than as one that finished. Hanging up puts the window back the way it was.

## A call is a relay, and the key stays on the server

The browser opens one WebSocket (`/api/realtime`) and the server opens another to the provider; the
credential is added on the server's hop and never reaches a page. Between the two the frames are
passed through as they are: the browser only appends audio, asks for a response or cancels one,
while what the session should be — persona, voice, audio formats — goes out as a single
`session.update` the server sends the moment the upstream connection opens. The persona is therefore
the server's to write: a browser can put anything into a `session.update` it sends itself, and what
this window is like should read the same wherever it runs.

The model is named in the connection's own query string, so it cannot be switched mid-call; switching
one means placing the call again.

## Configured in Settings › Server › Real-time voice

Four fields are written together: the site, the model, the voice and the key. The key is write-only,
exactly as the speech-input one beside it — a read carries `hasKey` and never the key itself, and an
empty field means "keep what is stored". An empty site resolves to the default one
(`https://dashscope.aliyuncs.com`) with the path `/api-ws/v1/realtime`, and the model and voice have
defaults of their own; the models and voices the settings page offers were all verified against this
account. Beside them is a connectivity check: it performs one handshake and one session update
against the fields **on screen**, writes nothing, and follows a save so that a configuration that
cannot connect is never left looking finished. Saving takes effect on the next call; there is nothing
to restart.

The pet's row says what the server's answer allows: with no key stored it states that the call is not
configured rather than letting a press fail.

## Interruption and levels

The moment the user starts talking the audio being played is flushed immediately and the reply's own
record of where it got to is dropped; the provider then reports the response as cancelled, and the
turn is kept as interrupted rather than as a reply that finished. Without that immediate flush the
model talks over the person interrupting it, which is the one thing that makes a spoken interface
feel dead.

Levels are quantized to a tenth before they reach state: the microphone's level arrives once per
audio frame — tens of times a second — and a raw number there re-renders the pet page as often for a
meter that cannot show the difference.

## Tests

- `packages/server/test/realtime.test.ts` (new, 15 cases): endpoint resolution (a site carrying a
  path, a port or a trailing slash), the id shape, the masked read, an empty `apiKey` keeping the
  stored one, `POST /test` writing nothing, and the status route open to any signed-in user.
- `packages/desktop/test/pet-window.test.ts` (+4): the resting and call sizes, growth out of the
  bottom-right corner rather than the top-left, and the return to the resting size clamped inside the
  work area.
- `packages/desktop/test/pet-prefs.test.ts`: existing cases updated for the new `call` field — it
  travels in status frames only and is never persisted.
- `packages/server/test/hot-replace.test.ts` (+3) and `packages/web/test/settings-sections.test.ts`
  (+3): the hot-replace stubs, and `realtime` appearing in the settings navigation's server group,
  visible to admins.
- `tsc --noEmit` for the three packages, the tree's `oxlint` and `prettier --check`, and `vite build`
  all pass. Full suites: 3158 cases over 217 files in `server`, 3962 over 351 in `web`, 319 over 27 in
  `desktop` — the server run's non-zero exit is a known pre-existing flake (with `Host github.com` in
  the host's `/root/.ssh/config`, the machines service's timer fires an unhandled rejection after
  teardown; the log carries zero failure separators).
- One real handshake against the provider, using this product's own session payload: `session.created`
  then `session.updated`, and a 100 ms silence frame was accepted. Nobody has yet spoken into a
  microphone on a real machine.
