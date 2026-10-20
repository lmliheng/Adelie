/**
 * Folding the sidebar to its rail, awaited the one way that is right for every spec that then
 * measures the rail: the width animates, so "narrower than the expanded sidebar" is not the same
 * as "settled".
 *
 * Measured on the real page (`aside.right` sampled every frame after the fold's click): 231.25 →
 * 178.28 → 132.84 → 101.83 → 81 → 66.98 → 57.72 → **51.97** → 48.91 → 48, the last ~60 ms of it
 * flat. A wait that stops at the first sample under 80 therefore returns at 66.98 (or, one frame
 * later, at 51.97 — the value a run of the `tooltip-beside` suite caught), while the page comes
 * to rest at 48. A hover panel is placed from its trigger's own box, which has long finished
 * moving at the 32 px icon size, so nothing but the rail-edge assertion goes wrong — and it goes
 * wrong quietly, as the pixel or two between where the rail was and where it ended up.
 *
 * So wait for the settled column instead: a 48 px rail whose separator measures a hair past the
 * integer (`RAIL_MAX` gives it that hair).
 */
import { expect } from "@playwright/test";

/** A settled rail, plus the sub-pixel its separator adds (the collapsed column itself is 48). */
const RAIL_MAX = 48.5;

export async function collapseRail(page) {
  await page.getByRole("button", { name: "收起侧栏" }).click();
  await expect
    .poll(
      () =>
        page.evaluate(() => document.querySelector("aside")?.getBoundingClientRect().right ?? 999),
      // The fold is ~150 ms; the poll's default is generous next to it, and naming it keeps a
      // slow machine's single slow frame from being read as "never settled".
      { timeout: 15_000 },
    )
    .toBeLessThanOrEqual(RAIL_MAX);
}
