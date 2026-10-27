# TokenDance gains the models it has added, and the group's prices are re-read

- **Date:** 2026-10-27
- **Type:** fix
- **Scope:** `core`, `docs`
- **Breaking:** no

[中文](2026-10-27-tokendance-catalog-refresh.zh.md)

The **Models** page's TokenDance group gains four rows: DeepSeek V4.1 Flash 1017, DeepSeek V4 Pro Preview,
Kimi K3.1 Pro and GLM-5.3 FlashX. All eighteen rows' prices, context windows and promotions were re-read
against the seller's own catalog as well (the previous read was 2026-09-16, and several rates have moved
since): **Sync presets** brings the new rows and the corrected prices into an existing Project, and a new
Project starts with them.

## Details

- **Four new rows** (`core/src/state/model-catalog.ts`):
  - `deepseek-v4.1-flash-1017` — the seller's catalog says V4.1 Flash's DeepSeek endpoint has been upgraded
    to the 1017 release, and this is the separately listed id at the same rates: a 1M window, image input,
    a list of CNY 2 / 8 per million (CNY 0.04 cache hit), 20% off inside DeepSeek's peak windows and half
    the list outside them. It and `deepseek-v4.1-flash` now store the peak rate the gateway actually bills
    plus the vendor's schedule, so both tiers land on what the gateway charges.
  - `deepseek-v4-pro` — the undated id of the same V4 Pro line: a 1,048,576-token window, text only, a CNY
    9 / 27 list (CNY 0.3 cache hit) at 10% off, and no peak/off-peak schedule.
  - `kimi-k3.1-pro` — the first of Moonshot's K3.1 line and the largest model the seller carries: a 1M
    window, image and video input, undiscounted at CNY 13 / 68 (CNY 1.3 cache hit).
  - `glm-5.3-flashx` — GLM-5.3 Flash's same-generation sibling: a 1M window, image input, undiscounted at
    CNY 2 / 7 (CNY 0.57 cache hit).
- **Corrections.** Kimi K3's 40% promotion and the 10% on `deepseek-v4-flash-0731` and `deepseek-v4-pro-0813`
  have all lapsed, so those three rows go back to recording the seller's list price with no promotion field;
  `seed-evolving`'s window is 1M rather than 256K; and two older DeepSeek rows move onto DeepSeek's
  peak/off-peak schedule (CNY 1.5 / 4.5 and 4.5 / 13.5 off-peak).
- **One approximation, written down in the code and the docs.** `deepseek-v4-flash-0731` and
  `deepseek-v4-pro-0813` are billed 20% off the list inside DeepSeek's windows, but half the **list**
  outside them, and a row holds a single rate (`discount` and `offPeakDiscount` are mutually exclusive).
  Both therefore store the billed peak rate and halve it, which puts their off-peak records 20% below what
  the gateway charges; the peak figures are exact. `deepseek-v4.1-flash` and `deepseek-v4.1-flash-1017`
  promote both tiers, so halving them is exact.
- **The data source changed.** Prices used to need a signed-in session on the seller's model pages; they now
  come from `GET https://tokendance.space/portal/api/models/all` (anonymous, carrying the current rate, the
  list price and both schedule tiers), with windows, modalities and protocols from
  `GET https://tokendance.space/gateway/v1/models`.
- Docs: the preset table, the DeepSeek off-peak section and the flat-promotions section of
  `packages/docs/content/models.zh.md` / `models.en.md` (nine discounted models become seven, eight resold
  rows become eleven).
- Tests: the three TokenDance pins in `core/test/model-catalog.test.ts` (the row list, the discounted list,
  the scheduled list) follow the new facts, and a new assertion pins that a row with neither a promotion nor
  a schedule bills exactly its published rates.

## Compatibility

- No interface, on-disk format or package-name change. A Project's own rows are not rewritten: both the new
  rows and the corrected prices arrive with **Sync presets**, and a row whose price the user edited keeps
  their price.
