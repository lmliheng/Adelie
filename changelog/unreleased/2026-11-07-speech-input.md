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

Which service does the transcribing is a Server setting — the same shape as the other per-deployment
settings: the address of the service, the model id, and the key. The key is write-only, exactly like a
Project's model credentials: the settings page reads back whether one is stored, never the value, so an
admin editing the model does not have to paste the key again.

## One protocol, two addresses

The real-time speech models are served by Alibaba's Bailian and re-served by a gateway in front of it.
Both speak the same protocol at their own path, so **the address is all that separates them**:

| Address | Endpoint |
|---|---|
| `https://tokendance.space` (default) | `wss://…/gateway/alibaba/api-ws/v1/inference` |
| `https://dashscope.aliyuncs.com` | `wss://…/api-ws/v1/inference` |

One utterance is one WebSocket: a `run-task` frame naming the model and the audio's format, the
recording in ~100 ms frames, then `finish-task`; the transcript comes back as `result-generated`
frames and `task-finished` ends it. Both sides answer the same model id,
`qwen-audio-3.1-asr-flash-streaming`, so the address is the only thing that changes.

## A sentence arrives many times

The service does not send a sentence once. While it is still recognizing one it sends the same
`sentence_id` again with more of it. Joining every frame would therefore repeat every word as many
times as it was revised — the first working draft here did exactly that, and only the protocol's own
shape, recorded in the reference app's design notes, showed it. A frame that names its sentence now
replaces the text held for that sentence, and sentences are joined in the order they first appeared.
A frame that names no sentence counts only when it is marked finished, which is the shape the
gateway's own example prints.

Watching the live service send 16 seconds of speech, it revised `sentence_id: 1` about twenty times —
`"" → "呵" → "呵我" → "呵，5月见" → "呵，5月见派" → "呵，五岳剑派，哎呀呀" → …` — and never marked any
of them `sentence_end`, not even the last one before `task-finished`. So the transcript has to be
built from the revisions and not from that flag: an implementation that waited for `sentence_end`
would have returned nothing at all.

## The recording

- A click starts the recording, the button turns into the way to end it, and a second click stops and
  transcribes. The label says which half is running — a recording nobody has ended and a recording
  being transcribed look alike otherwise, and only one of them is waiting on the user.
- The audio is decoded and downmixed in the page and sent as raw 16-bit PCM at 16 kHz — the sample
  rate the protocol documents — so nothing about the container the browser chose reaches the service.
- Two things are said where the draft is, not as a toast that dismisses itself: a recording that came
  back empty ("没有听清，请再说一次。"), and a microphone that was refused before any recording began.
  A refusal from the service — a key it does not accept, a model the account cannot use, an account in
  arrears — is shown in the service's own words, since that sentence names what to fix and the
  settings page is where it is fixed.

## Details

- `packages/server/src/services/asr.ts` (new): the protocol, one WebSocket per utterance, its frames
  turned into an ordered queue so a stalled service surfaces as a timeout instead of hanging the
  request, and the transcript folded by `sentence_id` as above.
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

- `packages/server/test/asr.test.ts` (new, 17 cases, against a local socket speaking the protocol):
  the `Authorization` header, the model and audio parameters, the audio's own bytes, `finish-task`,
  several sentences joined in arrival order, a revised sentence counted once, a finished sentence that
  names no id, an empty answer as a success, `task-failed` read back in the service's words, an
  unreachable service, the refusals (empty audio, an odd byte count, over the length cap, an
  unaccepted sample rate, a non-admin asking for the key, an invalid address never reaching storage),
  and the endpoint each kind of address resolves to.
- `packages/web/test/asr-audio.test.ts` (new, 7 cases): decode, downmix, resample, PCM16 conversion
  and base64 — including stereo and a sample rate that is not the recording's.
- `packages/web/e2e/asr-dictation.spec.mjs` (scratchpad; real browser, real server, a fake speech
  service): the settings page saves an address, a model and a key and the server reads back `hasKey`;
  then Chromium's fake microphone plays a WAV file, the button records real audio, and the sentence
  the service answers with lands in the draft.
- `packages/server/test/hot-replace.test.ts`: the Settings double gains the two new methods.

## Verified against the live service

A throwaway server was pointed at `https://dashscope.aliyuncs.com` with a real Bailian key and 16
seconds of speech posted to `/api/asr/transcribe`. Three runs, each about 3 s, each answering:

> 呵，五岳剑派，哎呀呀，别用这种眼神看着我嘛，人家可是一片好心呢。听说你们掌门身体有恙，可要试试本宫这上等的丹药。

with the model the setting names, `qwen-audio-3.1-asr-flash-streaming`. Before that, the same account
had answered `task-failed / Arrearage / Access denied, please make sure your account is in good
standing` — the gate opens and closes, and the route passes that sentence through verbatim when it
closes. (The reference implementation on this machine, driven with the same key, endpoint and model,
is refused identically, so it is the account's standing and not the integration.)

## Compatibility

No API removed. One new settings group, stored as KV rows like the rest; an unconfigured server keeps
its old behaviour — the microphone button reports that no model is configured and points at the
settings page. The default address is the gateway's, so a deployment holding a TokenDance key needs
only the key pasted in; one holding a Bailian key sets the address to `https://dashscope.aliyuncs.com`
and keeps the model as it is.
