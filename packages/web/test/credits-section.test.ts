/**
 * The credits page: the bundled fonts and their licences, and then the themes — the three the app
 * ships and the four the theme library offers.
 *
 * The theme block is static words rather than a fetch (the library is a directory this app reads
 * on demand, and this page has to be readable without it), so what is pinned here is the statement
 * itself: the licence, who maintains the library, the project link, and the four themes the
 * licence covers.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FONT_CREDITS } from "@adelie/ui/fonts-credits";
import { CreditsSection } from "../src/features/settings/credits-section";
import { zh } from "../src/lib/strings";

const html = renderToStaticMarkup(createElement(CreditsSection));

describe("CreditsSection", () => {
  it("lists every bundled font, under the licence it ships with", () => {
    for (const font of FONT_CREDITS) {
      expect(html).toContain(font.family);
      expect(html).toContain(font.licenseTitle);
    }
  });

  it("credits the themes with their licence, their author and their project", () => {
    expect(html).toContain(zh.settings.creditsThemeLibrary);
    expect(html).toContain("Apache-2.0");
    expect(html).toContain("lmliheng");
    expect(html).toContain('href="https://github.com/lmliheng/adelie-themes"');
    // Both halves of what the licence covers are named: the three the app ships, and the four the
    // library holds — a reader can tell what the sentence is about without leaving the page.
    for (const name of ["通用", "白领", "极客", "赛博朋克", "手绘涂鸦", "陶光", "拟物化"]) {
      expect(html, name).toContain(name);
    }
  });
});
