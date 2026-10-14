# Error notices stay read after a restart

- **Date:** 2026-10-15
- **Type:** fix
- **Scope:** `web`

[中文版](2026-10-15-error-read-status.zh.md)

Ported from upstream PenguinHarness (#1118, commit `591f091d`).

The Cost Center loaded the errors for the range on screen but marked the timestamp cached when the
app started as read, so an error that arrived while the app was open was marked read and raised the
notice again after a restart. Loading the Cost Center now refreshes the notice first, so both the
table and the read marker name the same newest error.

A read marker now hides the notice only once its preference write succeeds: a failed write reports
the API error and leaves the notice there to retry. Consecutive dismissals save in order, so an
earlier request cannot overwrite a later marker. The preference format is unchanged, and an error
newer than the saved timestamp still raises the notice.
