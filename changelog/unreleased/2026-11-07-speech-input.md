# The composer takes dictation: a microphone beside the +, transcribed on the server

- **Date:** 2026-11-07
- **Type:** feature
- **Scope:** `server`, `web`, `ui`
- **Breaking:** no

[中文](2026-11-07-speech-input.zh.md)

Until now the only way into a Session was the keyboard. The composer now carries a microphone button,
and what it records is transcribed and dropped into the draft, where it can be read and edited before
it is sent.

The transcription happens on the **server**, not in the page. The desktop shell has no Web Speech API,
so a browser-side recognizer would make the Web App and the desktop app behave differently on the same
account; and the provider's key then lives in one place, on the server, instead of being handed to
every browser that opens the page. What the page sends is the recording itself, over the session's own
credentials, and nothing of it is written to disk.

Which provider does the transcribing is a Server setting — the same shape as the other per-deployment
settings: the address of the service, the model id, and the key. The key is write-only, exactly like a
Project's model credentials: the settings page reads back whether one is stored, never the value, so an
admin editing the model does not have to paste the key again.

## The recording

- A click starts the recording, the button turns into the way to end it, and a second click stops and
  transcribes. The label says which half is running — a recording nobody has ended and a recording
  being transcribed look alike otherwise, and only one of them is waiting on the user.
- The audio is decoded and downmixed in the page and sent as raw 16-bit PCM at 16 kHz — the sample
  rate the streaming protocol documents — so nothing about the container the browser chose reaches the
  provider.
- Two things are said where the draft is, not as a toast that dismisses itself: a recording that came
  back empty ("没有听清，请再说一次。"), and a microphone that was refused before any recording began.
  A refusal from the provider — a key that is not accepted, a model the account cannot use — is shown
  in the provider's own words, since that sentence names what to fix and the settings page is where it
  is fixed.

## Details

- `packages/server/src/services/asr.ts` (new): one WebSocket per utterance against the streaming
  protocol — `run-task` naming the model and the audio format, the audio in ~100 ms frames,
  `finish-task`, then `result-generated` sentences until `task-finished`. The transport's shape never
  leaves the file: frames become an ordered queue so nothing is lost between the handshake and the
  collect loop, and a stalled service surfaces as a timeout rather than a hanging request.
- `packages/server/src/http/routes/asr.ts` (new): `GET|PUT /api/asr/config` is an admin's (it holds the
  key); `POST /api/asr/transcribe` is every signed-in user's. An empty or omitted `apiKey` on a PUT
  keeps the stored one, and every field is validated before any is written.
- `packages/server/src/db/repos/server-settings.ts`, `.../mechanisms/settings.ts`: the three values,
  as one more settings group.
- `packages/web/src/lib/asr-audio.ts` (new): decode, mix to mono, resample, PCM16, base64.
- `packages/web/src/features/chat/use-asr-recorder.ts` (new): the recording's state machine
  (`idle | recording | transcribing`) and its notices.
- `packages/web/src/features/settings/asr-section.tsx` (new) and `.../settings-dialog.tsx`: the "语音
  输入" page under Server, for admins.
- `packages/web/src/features/chat/chat-input.tsx`: the microphone, the notice line above the composer.
- `packages/ui/src/components/icons/icons.ts`: a `microphone` icon.

## Tests

- `packages/server/test/asr.test.ts` (new, 15 cases, against a local socket speaking the protocol):
  the `Authorization` header, the model and audio parameters the provider is told, the audio's own
  bytes, `finish-task`, several sentences joined in arrival order, an empty answer as a success,
  `task-failed` read back in the provider's words, an unreachable service, and the refusals — empty
  audio, an odd byte count, over the length cap, an unaccepted sample rate, a non-admin asking for the
  key, and an invalid address never reaching storage.
- `packages/web/test/asr-audio.test.ts` (new, 7 cases): decode, downmix, resample, PCM16 conversion
  and base64 — including stereo and a sample rate that is not the recording's.
- `packages/web/e2e/asr-dictation.spec.mjs` (scratchpad; real browser, real server, a fake speech
  service): the settings page saves an address, a model and a key and the server reads back `hasKey`;
  then Chromium's fake microphone plays a WAV file, the button records real audio, and the sentence
  the service answers with lands in the draft.
- `packages/server/test/hot-replace.test.ts`: the Settings double gains the two new methods.

## Compatibility

No API removed. One new settings group, stored as KV rows like the rest; an unconfigured server keeps
its old behaviour — the microphone button reports that no model is configured and points at the
settings page. The default address and model are TokenDance's, so a deployment holding a TokenDance
key needs only the key pasted in.

**The end-to-end run was verified against a fake speech service, not against a live provider:** the
TokenDance key at hand is refused by TokenDance itself (`unauthorized / API 密钥不存在`), so a real
transcript has not been observed yet.
