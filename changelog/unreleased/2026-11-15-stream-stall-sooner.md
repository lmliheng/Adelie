# A network that swallows the live stream: the page starts refreshing itself after twenty seconds

- **Date:** 2026-11-15
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-15-stream-stall-sooner.zh.md)

Some networks (an internet cafe, a campus, any exit with a transparent proxy or a flow-control plug-in) complete the handshake and then deliver not one byte. On such a network a Session looks connected while nothing arrives: the reply is being written the whole time, and the screen never shows it. The page used to take **about ninety seconds** to decide the live connection was dead and switch to refetching the conversation every 6 seconds — and for those ninety seconds all the reader had was "Adelie is stuck". It now takes **about twenty**.

## Details

- `packages/web/src/api/sse.ts`: the first-frame deadline `FIRST_FRAME_MS` goes from 30 s to 10 s (the server answers a subscribe with its snapshot, so a connection that long without one never got through), and the number of consecutive silent connections that add up to a verdict, `MAX_STALLED`, goes from 3 to 2. The two multiply into the wait: 90 s becomes about 20 s. The 50 s silence window, the once-a-minute probe, and the instant return to "live" on any frame that arrives are all unchanged.
- The cost is that a slow network is likelier to be misjudged: a wrong verdict means the page refetches the conversation every 6 seconds and stops reopening the stream; the moment a probe really does receive a frame, the strip clears and the polling stops. That is the deliberate trade — leaving someone staring at a blank page for another minute is worse than a few extra reads.

## Tests

- `packages/web/test/sse.test.ts`: the same case with its timeline rewritten against the new constants (nothing at 9 s, the reopen at 10 s, the stall on the second silent connection, the probe after 60 s, a frame on the probe returning it to live, and a probe the browser gives up on scheduling the next one).

## Compatibility

Two constants and the test's timeline changed; the protocol, the server and the on-screen wording are untouched.
