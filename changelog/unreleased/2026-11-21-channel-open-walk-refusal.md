# A channel whose first screen could not read all its earlier days now says so, instead of just holding less history

- **Date:** 2026-11-21
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-21-channel-open-walk-refusal.zh.md)

Opening a channel assembles the first screen before the first paint: today's day file, then earlier
ones one at a time until the stream holds enough messages or the day budget runs out. A day in that
walk that did not come back was treated as the end of the walk and nothing else — the stream
rendered with what it had reached, which on a quiet channel is today and nothing else. Nothing on
screen said a read had failed; the page simply looked like a channel with almost no history, and the
only way to learn otherwise was to press "Earlier days" and hope (7.19's rule: the sentence belongs
where the attempt was made).

The reason is now drawn on the surface that attempt already had: the line under the "Earlier days"
button, which is exactly the day the walk stopped on and therefore the retry. Same words, same
`role="alert"`, same `data-testid="channel-earlier-refusal"` — a press that fails later replaces it,
a channel switch clears it.

## Details

- `packages/web/src/features/company/channel-view.tsx`: the first load's walk back catches its own
  failure instead of swallowing it — `setEarlierRefusal(channelEarlierRefusalLine(e))`, guarded by
  the load's own sequence check so a refusal that lands after another channel started loading does
  not explain itself here. Today's own request failing is unchanged (it is fatal, with the error
  state and its Retry). No new state, no new sentence, no new dependency.
- `packages/web/src/features/company/channel-earlier-refusal.ts`: the module comment now says which
  two attempts reach this line, and why they are one sentence — both leave the reader in the same
  place, and the button below continues from the same missing day.

## Tests

- `packages/web/e2e/channel-earlier-refusal.spec.mjs` (a third case, real server + real browser):
  the older-day route is held to answer 500 **before** the channel is opened, so the opening walk is
  what fails → today's message is in the stream, the oldest day is not, exactly one request was
  refused, the line under the button reads "更早的记录没有取到：服务器内部错误，请稍后重试。", it is
  the only `role="alert"`, the notification region does not carry it, and it is **still there seven
  seconds on**; release the route and press the button → the line goes and the day behind it lands.

## Compatibility

Front-end rendering only: interfaces, wire formats and stored data are untouched, the server did not
change, and paging still reads one day file per press.
