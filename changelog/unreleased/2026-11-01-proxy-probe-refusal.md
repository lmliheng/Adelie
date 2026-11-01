# A failed reachability test says why in the probe block, instead of in a toast that expires

- **Date:** 2026-11-01
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-01-proxy-probe-refusal.zh.md)

Settings → Server → Proxy options carries a reachability test under the Save row. Every outcome it
can have — reachable, timed out, DNS, refused, TLS — arrives inside a 200 and lands on its target's
row. Only the request itself failing (a lost session, a dead server) comes back as an error, and
that one filled no row at all: the block looked exactly as it did before anyone pressed the button,
every target still reading 「Not tested」, and the reason arrived as a notification over it. Six
seconds later even that was gone, so a reader who looked away could not tell "not run" from "could
not run".

The sentence now stays in the block: under the 测速 button, above the targets it could not fill, in
the danger ink and as a `role="alert"` clamped to two lines with the whole of it on hover. It is one
sentence per run — six failed requests carry the same words, and six copies of one sentence is not
six pieces of information — and it goes when the next run starts or when a save replaces the path it
described. Nothing was written or measured by a failed run, so the button is the retry.

No new copy was written: the words come from the app's existing error table through the shared
`refusalText()`, behind the same 「操作被拒绝：」 lead-in the other refusals use.

## Details

- `packages/web/src/features/settings/proxy-section.tsx`: a `probeRefusal` state, filled by the
  failing request instead of `toastError` and cleared when a run starts and when saved settings are
  adopted; the sentence is drawn between the button row and the target list, because it is about the
  run rather than about any one target.
- `packages/web/src/features/settings/proxy-probe.ts`: `probeRefusalFor()` — whether one failed
  request earns words. It answers the two rules the block needs in one place: keep the run's first
  sentence (later rejections of the same run are the same news), and drop answers from a run a save
  has already superseded (a sentence about a path nothing travels any more is as wrong as the stale
  numbers a save clears).

## Tests

- `packages/web/test/proxy-probe.test.ts` (six unit cases): a failed request draws its own sentence;
  a second rejection of the same run keeps the first; an answer from a superseded run adds nothing
  and removes nothing; the next run's sentence replaces the last one's; a dead connection uses the
  client's own words; a value with nothing to say falls back to the generic text.
- `packages/web/e2e/proxy-probe-refusal.spec.mjs` (new, against the real server, probe route stubbed
  to answer 500 `internal`): one run puts exactly one sentence in the block, sends six requests, and
  leaves the notification area empty; all six rows still say 「未测试」 and none of them carries the
  sentence; it is still there seven seconds later; the next run, which lands, takes it away and fills
  all six rows.

## Compatibility

- No API, request or stored-data change: the same `POST /api/admin/settings/proxy-probe/:provider`
  is sent with the same body and the same per-target answers are read. Only where a failed *request*
  reports itself moves — from a notification to the block that ran it.
