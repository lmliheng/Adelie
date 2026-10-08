# A request's cost is fixed when its usage row is written

- **Date:** 2026-10-08
- **Type:** feature
- **Scope:** `server`
- **Breaking:** yes — a price change no longer re-prices usage already recorded

[中文版](2026-10-08-usage-cost-at-record-time.zh.md)

Each usage record now carries the cost of the Request it summarises, fixed at the moment the row is
written, at the price the Project stores for that paired reference then. Editing a price, running
**Sync presets**, or a promotion starting or ending changes only what later Requests cost: the cost
center, the conversation toolbar, `penguin cost` and company-mode budgets sum the stored costs, and
none of their queries looks a price up any more.

## Server

- `db/schema.ts` and migration **14** `usage-record-cost` add `cost` (REAL; NULL = the model has no
  price) and `cost_settled` (INTEGER, default 0) to `usage_records`, via `ensureColumn` so a
  declarative-track database that already has them is untouched. The migration deliberately does not
  cost the rows already there: pricing them needs each Project's config, which SQLite does not have.
- `db/repos/usage.ts`: `insert` writes both columns; the aggregates sum `cost` and count `uncosted`
  instead of returning raw Token sums, so a group's cost is the bill and `hasUncosted` still flags a
  lower bound. `unsettledRefs` / `unsettledRows` / `settle` drive the one-time compatibility pass.
- `runtime/usage-recorder.ts` prices each row from `ProjectConfigStore.getPricing(projectId,
  provider, modelId, at)` at its own clock's instant, and takes that as the bill. A price that
  cannot be read counts as no price: the row is written anyway, since losing the Tokens would be
  worse than not costing them.
- `services/project-config-service.ts`: `getPricing` now takes the instant and returns the one rate
  in force then — the stored price, less the row's promotion, at the tier that instant falls in
  (`scheduledRateAt`, next to the existing `promotedRates`). A hand-typed price is billed as typed in
  both tiers: nothing here knows whether it is a peak rate, and halving it would invent a discount.
- `services/usage-service.ts`: the queries no longer price anything; a row's cost is what the
  recorder fixed. `lifetimeCost` (the admin backend's per-account cost column) is the same recorded
  sum, one unfiltered grouped scan.
- `services/trace-service.ts`: the Trace page is unchanged in kind — it still prices each Request at
  the Project's current price, at that Request's own timestamp (memoized per hour and reference), so
  after a price change it can differ from the cost center, which stays the bill.

## Compatibility

Rows written before this change carry no cost. `Startup` settles them once, before anything reads the
cost center (`UsageService.settleUnsettledCosts`, idempotent, keyed on `cost_settled`), at the price
each Project stores now and at the tier each row's own timestamp fell in. A failure is recorded
(`usage_cost_settle_failed`) rather than thrown, and those rows then read as uncosted until a later
boot. Remove `cost_settled` and the settle two releases after this one.

## Deliberately not adopted from upstream

This is upstream's `feat/usage-cost-at-record-time`, still unmerged, of which only the server half is
taken — in this tree the per-row promotion lives in `web.db`'s `model_promotions` table, which the
core process cannot read, so core cannot stamp the rate a Request was billed at on its `token_usage`
event. Left out, with the reason:

- Core's `token_usage.pricing` stamp and the `resolveBilledPricing` / `billedRates` helpers that read
  it. With the promotion in `web.db`, core sees only the file's list price, so a stamped rate would
  bill every promoted row at full price.
- The catalog's `discountUntil` / `discountRateAt`. A promotion here is a row in `model_promotions`
  with no end instant, so a time-bounded discount has nowhere to live yet.

The complete version of this feature would move the promotion into the Project's own config beside
the list price and let core stamp the rate. That is a product decision, not a mechanical port.
