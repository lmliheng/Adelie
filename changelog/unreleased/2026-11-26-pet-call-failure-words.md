# The pet's call says why it failed in the window's language

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `web`, `server`

[中文版](2026-11-26-pet-call-failure-words.zh.md)

A call that could not start explained itself in the wrong language, or not at all. The relay's own sentence — the speech service refused the connection with HTTP 401 — is written in English on the server, so a Chinese window showed English; the transport's fallbacks were Chinese sentences in code, so an English window showed Chinese; and on top of both, the socket's close reason landed in the stage as a bare token (`upstream`) and replaced the sentence that had just said what happened.

## Details

- The call's failure sentences now live in both dictionaries (`S.pet.callConnectFailed`, `callClosed`, `callServiceError`, `callServiceFailed`, `callUnreachable`, `callRejected(detail)`, `callNoMic`), read where they are shown, so a Chinese window and an English one each get theirs. The microphone refusal — the most common one — is among them.
- The transport (`realtime-client.ts`) no longer builds sentences: a handshake that did not happen rejects with `RealtimeConnectError` carrying `connect_failed` or `closed`, and the call's own module (`call-failure.ts`) turns that into copy.
- The relay's `proxy.error` frame now carries `code` (`upstream_rejected` / `upstream_unreachable`) and `detail` (the provider's answer, e.g. `HTTP 401: …`) beside the sentence it always carried, and the page composes the sentence from them. A server that predates the code still works: its sentence is shown as it is.
- The socket's close reason is no longer shown. It is a token (`upstream`, `bye`) from the relay or the provider; a call that was already told why keeps that sentence, and one that was not gets the page's own (see `closedCallText`).
- One refusal per call: a refused handshake ends the upstream socket too, and a `ws` closed before its handshake reports an error of its own, which used to arrive last as a second, vaguer `proxy.error`.

## Verification

- `packages/web/test/pet-call-failure.test.ts` (10 cases) and `pet-call-transport.test.ts` (4) pin the two languages, the codes, the fallbacks and the close-reason rule; `packages/server/test/realtime.test.ts` pins the frame's `code` / `detail` and that exactly one refusal is sent.
- Real server, real browser, two stand-in providers (one answering 401, one with nothing listening): before the change the stage said `upstream` in all four combinations; after it, 「语音服务拒绝了这次连接（HTTP 401: no）」/「连不上语音服务。」 in a Chinese window and "The speech service refused the connection (HTTP 401: no)." / "Could not reach the speech service." in an English one, with no console errors.
