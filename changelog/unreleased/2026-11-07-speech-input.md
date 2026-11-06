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
  back empty ("没有听清，请再说一次。"), and the reason a microphone could not be opened (next section).
  A refusal from the service — a key it does not accept, a model the account cannot use, an account in
  arrears — is shown in the service's own words, since that sentence names what to fix and the
  settings page is where it is fixed.

## When there is no microphone, say why

A microphone that could not be opened used to get one sentence: "check the browser's or the system's
permission for it". The case users actually hit is the one where **there is no permission to grant**:
a browser offers a microphone only on https or localhost, and `http://<a machine's address>:7777` is
neither. There `navigator.mediaDevices` **does not exist**, so no prompt is ever shown — telling
someone to go check the permission is telling them to look for something that will never appear.

Asked of a real browser against a live address, this is what it answers:

```
http://110.42.63.153:7777/   isSecureContext: false   mediaDevices: undefined
                             getUserMedia → TypeError: Cannot read properties of undefined
http://localhost:7777/       isSecureContext: true    mediaDevices: object
                             permissionQuery: prompt   getUserMedia → NotFoundError (no sound card on that box)
```

So the page now decides first and asks afterwards, and the four ways it can be closed get four
sentences:

- **The address is not a secure context** — one line naming that, and on hover the three ways out: use
  the Adelie desktop app (it runs on localhost), put Adelie behind https, or add this address to
  `chrome://flags/#unsafely-treat-insecure-origin-as-secure` for now.
- **This browser cannot record from a microphone.**
- **The permission was denied** — undoing that is the icon in the address bar, which is what the line says.
- **No device**, or **another program holding it**.

## The settings page can check the link

Storing an address, a model and a key is not the same as their working, and a microphone is the
slowest way to find that out. The settings page therefore gains "Test connection": one whole task
against the service — open it, feed it half a second of silence, finish it — which is the call a
recording makes minus the recording, so what it proves is what pressing the microphone proves. It
checks the **fields on screen**, not the stored configuration (saving a key in order to learn whether
it works is the wrong order), and a save follows itself with one, so a configuration that cannot
connect is never left looking finished. Each answer names the endpoint it used, because which path a
site address resolves to is exactly the thing the fields cannot show.

**A failed handshake is asked about once more.** A wrong key, a host that does not exist and a path
that is not the endpoint all arrive from the WebSocket layer looking identical (the same bare
`TypeError`, the same code 1006), so all three used to read "could not reach the service" — which
sends an operator to look at the network for a key that is simply wrong. Once the handshake fails,
the same credential is now put to the same address over plain HTTP: 401 is the key being refused, and
any other status is reported as it stands.

## Details

- `packages/server/src/services/asr.ts` (new): the protocol, one WebSocket per utterance, its frames
  turned into an ordered queue so a stalled service surfaces as a timeout instead of hanging the
  request, and the transcript folded by `sentence_id` as above. Also `probeAsr` (the connectivity
  check) and the HTTP question asked behind a failed handshake.
- `packages/server/src/http/routes/asr.ts` (new): `GET|PUT /api/asr/config` is an admin's (it holds the
  key); `POST /api/asr/test` is an admin's too, and is the settings page's check;
  `POST /api/asr/transcribe` is every signed-in user's. The address, model and key are resolved by one
  rule, so what a save stores is what the check probes. An empty or omitted `apiKey` on a PUT keeps
  the stored one, and every field is validated before any is written.
- `packages/server/src/api/types.ts`: the three interfaces.
- `packages/server/src/db/repos/server-settings.ts`, `.../mechanisms/settings.ts`: the three values,
  as one more settings group.
- `packages/web/src/lib/asr-audio.ts` (new): decode, mix to mono, resample, PCM16, base64.
- `packages/web/src/lib/mic-access.ts` (new): whether a microphone may be asked for at all, and what a
  refusal was called — two pure functions that touch no browser global, so both are testable.
- `packages/web/src/features/chat/use-asr-recorder.ts` (new): the recording's state machine
  (`idle | recording | transcribing`) and its notices.
- `packages/web/src/features/settings/asr-section.tsx` (new) and `.../settings-dialog.tsx`: the "语音
  输入" page under Server, for admins, with the Test connection button and the line its answer lands on.
- `packages/web/src/features/chat/chat-input.tsx`: the microphone, the notice line above the composer.
- `packages/ui/src/components/icons/icons.ts`: a `microphone` icon.

## Tests

- `packages/server/test/asr.test.ts` (new, 25 cases, against a local socket speaking the protocol):
  the `Authorization` header, the model and audio parameters, the audio's own bytes, `finish-task`,
  several sentences joined in arrival order, a revised sentence counted once, a finished sentence that
  names no id, an empty answer as a success, `task-failed` read back in the service's words, an
  unreachable service, a refused credential (401), a site that answers without upgrading, the refusals
  (empty audio, an odd byte count, over the length cap, an unaccepted sample rate, a non-admin asking
  for the key, an invalid address never reaching storage), the endpoint each kind of address resolves
  to, and the connectivity check's own five situations (the form's fields without storing them, the
  stored ones when it omits them, a refusal and an unreachable site, an unresolvable field and no key,
  and a non-admin).
- `packages/web/test/asr-audio.test.ts` (new, 7 cases): decode, downmix, resample, PCM16 conversion
  and base64 — including stereo and a sample rate that is not the recording's.
- `packages/web/test/mic-access.test.ts` (new, 7 cases): the insecure origin, the missing support, and
  the name of each refusal.
- `packages/web/e2e/asr-dictation.spec.mjs` (scratchpad; real browser, real server, a fake speech
  service), three cases: the settings page saves an address, a model and a key and the server reads
  back `hasKey`, then Chromium's fake microphone plays a WAV file, the button records real audio, and
  the sentence the service answers with lands in the draft; the settings page's check, including an
  address nothing listens on; and the notice on an **http address that is not localhost**, where the
  case first asserts that the browser really has no `mediaDevices`.
- `packages/server/test/hot-replace.test.ts`: the Settings double gains the two new methods.

## Verified against the live service

A throwaway server was pointed at `https://dashscope.aliyuncs.com` with a real Bailian key and 16
seconds of speech posted to `/api/asr/transcribe`. Three runs, each about 3 s, each answering:

> 呵，五岳剑派，哎呀呀，别用这种眼神看着我嘛，人家可是一片好心呢。听说你们掌门身体有恙，可要试试本宫这上等的丹药。

The connectivity check was run against the same live site, three inputs, one each:

```
POST /api/asr/test [stored config]  : 200 in 444ms {"ok":true,"message":"","endpoint":"wss://dashscope.aliyuncs.com/api-ws/v1/inference"}
POST /api/asr/test [wrong key]      : 200 in 404ms {"ok":false,"message":"The speech service refused the credential (HTTP 401).",…}
POST /api/asr/test [nothing there]  : 200 in  15ms {"ok":false,"message":"Could not reach the speech service.",…}
```

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

Using the microphone on a deployment served over http needs that address to be one the browser treats
as secure (https, localhost, or the flag above). That is the browser's rule, not this page's choice.
