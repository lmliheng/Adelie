# A live channel message lands under the day its file belongs to, not under today

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `web`, `server`

[中文](2026-11-22-channel-live-day.zh.md)

The open channel appends `org_channel` events to its stream without a refetch. The event named the
message and its channel but not the day file the scan had read it from, so the view filed every
arrival under "today" (`meta.today`, the server's own date). That is right for a message being sent
now and wrong for every other line the scan publishes: a line a CLI or a hand edit appended to
yesterday's file, or one written a second before midnight and published by the scan after it, was
drawn inside today's section of the channel that was already open — while a reload put the same line
back under its own day. Two readings of one channel disagreed, and the message's own clock (23:59 in
today's section) was the only hint.

The event now carries `date`, the day file the line came out of, and the view groups by it. A day the
opening load never fetched is created where its date sorts, so an earlier day is never drawn below
today.

## Details

- `packages/server/src/api/types.ts`: `CompanyServerEvent`'s `org_channel` variant gains `date`
  (`yyyy-mm-dd`, the organization's timezone) with the reason it exists.
- `packages/server/src/runtime/organization/reconcile.ts`: `scanChannels` stamps each published event
  with the day of the file it is iterating — it already had it as its loop variable.
- `packages/web/src/features/company/channel-view.tsx`: the live append uses `ev.date` instead of
  `meta.today`.
- `packages/web/src/features/company/channel-stream.ts`: `appendMessage` inserts a day that is not
  loaded yet at its sorted position instead of at the end (the array is drawn oldest first), and its
  comment says why. Adding a message to a day that is already there is unchanged.

## Tests

- `packages/web/test/channel-stream.test.ts`: the ordered insert — an earlier day goes above today, a
  day between two loaded ones goes between them, the array it came from is untouched, and a day that
  is already present keeps its place.
- `packages/server/test/organization-runtime.test.ts`: the published event's `date` is the day file
  the line was read from.
- `packages/web/e2e/channel-live-day.spec.mjs` (real server + real browser): a channel open on today
  only; a line written straight into yesterday's file in the data root, then a write through the API
  runs the scan that publishes it (no model key needed) → yesterday becomes its own section above
  today with the line inside it, and a reload shows the same order. Against the previous build the
  same case fails at the day divider, with the line drawn under today.

## Compatibility

The stored channel format, the routes and the refetch paths are untouched. The event's new field is
additive; the client reads it and nothing else changed in the wire format.
