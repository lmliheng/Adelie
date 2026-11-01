# The terminal survives a mobile network, and reattaches on its own

- **Date:** 2026-11-02
- **Type:** feat
- **Scope:** `server`, `web`
- **Breaking:** no

[中文版](2026-11-02-terminal-on-a-slow-link.zh.md)

A terminal opened over a phone's network used to die quietly. The socket does not close politely there — the radio hands over, a carrier NAT reaps an idle flow, the browser freezes the tab — and what the page was left holding was a connection that would never carry another byte, painted as "stream closed". The pty on the server was fine the whole time; a reload was the only way back to it.

Both ends now probe each other. Either side may send a Ping and the peer echoes it back untouched, so a socket that stopped carrying bytes is found within a bounded silence window rather than never. The server closes a viewer that stops answering; the client reattaches after one that stops answering it, with a bounded backoff, and the reattach repaints the screen from the server's own snapshot — the same repaint a fresh attach gets. A network coming back, or a tab coming back, collapses that wait: the connection retries at once, and a socket that merely *looks* open is probed before it is trusted. A tab that was suspended is not mistaken for a dead link. The one failure worth stopping on is a terminal that is genuinely gone, which a retry checks for before it reconnects. The status word for all of this is `reconnecting`, distinct from the `connecting` of a first attach.

Ported from PenguinHarness `#639` (`f52617695`), by applying its changes rather than merging branches: all sixteen of its files exist here and `git apply -3 --check` was clean. Nothing this change touches is missing from this tree (the machine-side terminal shells and `terminal-panel.tsx` are outside it), so there were no trade-offs to record.

## Details

Every step of the reattach carries its own clock, and only one attempt is ever in flight. A network or a tab that comes back while an attach is still pending joins that attempt instead of starting another: the first-attach policy runs once (twice could mean two terminals), one socket is open at a time, and an answer that arrives after its attempt was given up on opens nothing — the old socket is closed before the next one is dialled. A dial that never reaches the open state (15 seconds) and an existence probe that never answers (10 seconds) read as the same transient failure a rejection does, and go to the backoff; a pane that goes away stops even a probe that is still out. The right to be judged by silence belongs to the socket that earned it: probe answers do not carry over a reattach, so a fresh socket onto an older server is never killed by the previous one's answers.

Three numbers stopped being constants tuned on a LAN:

- **The output merge window** followed the round trip. At 200ms it merged almost nothing while producing hundreds of small frames a second; it is now a quarter of the measured trip, bounded to 5–50ms, so a fast link keeps the behaviour it had.
- **The backpressure high-water mark** was a flat megabyte, which is milliseconds of lag on a LAN and many seconds on a slow uplink — the "output arrives late, then jumps" complaint. It is now derived from what the viewer's socket actually delivers, so it bounds *time* (three quarters of a second) instead of bytes.
- **Container resizes** reached the pty one per pixel change. On a phone the address bar collapses and the soft keyboard opens constantly, and every size that lands costs a SIGWINCH and a full repaint from whatever is running. They settle for 120ms now, and only a change that moves the grid is sent at all.

The stream is also compressed on the wire (permessage-deflate, a 13-bit window and no client context takeover), and the small frames are left out of it by the sender itself, message by message. ws honours a config-level `threshold` only for a direction that negotiated away its compression context; this stream keeps its context — a shared context is what compresses repeated output best — so the 512-byte cutoff is decided at the send call, per message. The backlog is counted in the bytes the terminal *produced* (ws's own send callbacks) rather than in `bufferedAmount`: once compressed, that is wire bytes, and a screenful of repeated build output is a hundred times smaller there and would read as "not behind at all".

## Compatibility

- Both ends can be older than this change: a hot push replaces the platform under a tab that was not reloaded, and a machine runs whatever version it was last installed with. Unknown frame types were already harmless in both directions; the hazard is the conclusion each end draws from silence, so both sides share one rule with no version negotiation: **only a peer that has answered a probe is ever judged for its silence** (one `answersProbes` per socket, cleared each time a socket opens). Without it, a server would close an old page every 75 seconds (and that page has no reattach), and this page would reattach to an old server roughly every minute.
- No API or dependency change; the two new frame types live only in the server's and the Web's own frame definitions.
