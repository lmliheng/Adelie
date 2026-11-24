/**
 * The pet's figure: which drawing the /pet page shows, and that another window's change reaches it
 * with no reload — the `storage` event path the page relies on, because the shell's companion window
 * is a different document from the one the Appearance row is in.
 *
 * The second figure is the reader's own picture, which is the same path with a second key: the image
 * is written beside the choice, and the pet draws it as an image. That the image really decodes is
 * asserted (`naturalWidth`), not just that an `<img>` appeared — a broken `src` still has a box.
 *
 * The drawn fish that used to be the third figure was retired on 2026-11-24 (the owner asked for the
 * community's anthropomorphic "blue fat fish", which is a picture rather than a drawing of the fish),
 * so a desktop that still has `whale` stored is the fallback case and is asserted here too.
 */
import { expect, test } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

// The shell's own window size (`PET_WINDOW_SIZE` in packages/desktop/src/pet-window.ts), so the
// panel's fit is judged at the size it is actually given.
test.use({ viewport: { width: 260, height: 300 } });

/** The penguin's beak and feet: the one warm fill of the one drawing left. */
const penguinWarm = 'svg [fill="#f59e0b"]';
/** A real 1×1 PNG, so the browser has something it can actually decode. */
const PICTURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** The pet itself, addressed the way a person sees it: the thing that opens the panel. */
const petOf = (page) => page.getByRole("button", { name: "点我：余额、新版本和通知" });

test("the pet draws the reader's own picture, and follows another window", async ({
  page,
  context,
}) => {
  await provisionAndLogin(page.request, "petfigure", "petfigure-pw");
  await page.goto("/pet");

  // Nothing stored: the penguin, the drawing this page has always had.
  await expect(page.locator(penguinWarm).first()).toBeVisible();
  await expect(petOf(page).locator("img")).toHaveCount(0);

  // A second window of the same origin writes what the Appearance row writes — the image, then the
  // choice — and the pet window follows with no reload.
  const settings = await context.newPage();
  await settings.goto("/");
  await settings.evaluate((url) => {
    localStorage.setItem("penguin.petFigurePicture", url);
    localStorage.setItem("penguin.petFigure", "picture");
  }, PICTURE);

  const image = petOf(page).locator("img");
  await expect(image).toHaveAttribute("src", PICTURE);
  // Drawn, not merely present: a data URL the browser cannot decode would still leave a box.
  await expect.poll(() => image.evaluate((el) => el.naturalWidth)).toBe(1);
  // And the penguin is gone, so the picture is the pet rather than something beside it.
  await expect(page.locator(penguinWarm)).toHaveCount(0);

  // Choosing the drawn figure again puts the picture away without touching the stored image.
  await settings.evaluate(() => localStorage.setItem("penguin.petFigure", "penguin"));
  await expect(page.locator(penguinWarm).first()).toBeVisible();
  await expect(image).toHaveCount(0);
  expect(
    await settings.evaluate(() => localStorage.getItem("penguin.petFigurePicture")),
    "the picture survives a switch away from it",
  ).toBe(PICTURE);

  await settings.close();
});

test("a figure this build no longer draws falls back to the penguin", async ({ page, context }) => {
  await provisionAndLogin(page.request, "petretired", "petretired-pw");
  await page.goto("/pet");

  const settings = await context.newPage();
  await settings.goto("/");

  // `picture` with no picture stored: nothing to draw, so the bird stands in rather than a gap.
  await settings.evaluate(() => localStorage.setItem("penguin.petFigure", "picture"));
  await expect(page.locator(penguinWarm).first()).toBeVisible();
  await expect(petOf(page).locator("img")).toHaveCount(0);

  // `whale`: the figure a desktop that picked the retired fish still has stored.
  await settings.evaluate(() => localStorage.setItem("penguin.petFigure", "whale"));
  await expect(page.locator(penguinWarm).first()).toBeVisible();
  await expect(petOf(page).locator("img")).toHaveCount(0);

  await settings.close();
});
