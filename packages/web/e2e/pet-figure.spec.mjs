/**
 * The pet's figure: which drawing the /pet page shows, and that another window's change reaches it
 * with no reload — the `storage` event path the page relies on, because the shell's companion window
 * is a different document from the one the Appearance row is in.
 */
import { expect, test } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

test.use({ viewport: { width: 260, height: 248 } });

/** The penguin's beak and feet: the one warm fill in either figure. */
const penguinWarm = 'svg [fill="#f59e0b"]';
/** The blue fat fish's own body colour (the figure's stored name is still `whale`). */
const whaleBlue = 'svg [fill="#4d6bfe"]';

test("the pet draws the figure the preference names, and follows another window", async ({
  page,
  context,
}) => {
  await provisionAndLogin(page.request, "petfigure", "petfigure-pw");
  await page.goto("/pet");

  // Nothing stored: the penguin, the drawing this page has always had.
  await expect(page.locator(penguinWarm).first()).toBeVisible();
  await expect(page.locator(whaleBlue)).toHaveCount(0);

  // A second window of the same origin writes the preference, the way the Appearance row does.
  const settings = await context.newPage();
  await settings.goto("/");
  await settings.evaluate(() => localStorage.setItem("penguin.petFigure", "whale"));

  // The pet window follows with no reload, and draws the fish whole.
  await expect(page.locator(whaleBlue).first()).toBeVisible();
  await expect(page.locator(penguinWarm)).toHaveCount(0);

  await settings.close();
});
