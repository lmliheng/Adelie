/**
 * The logos: a preset provider draws its brand mark in currentColor, an unknown group id a letter
 * tile inked through one scheme-following value, and the app emblem the asset its caller names.
 */
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { avatarTile } from "../src/components/icons/avatars/avatar";
import { AppLogo } from "../src/components/icons/logos/app-logo";
import { ProviderLogo } from "../src/components/icons/logos/provider-logo";
import { renderStatic } from "../src/testing";

describe("ProviderLogo", () => {
  it("draws a preset vendor's mark in currentColor", () => {
    const html = renderStatic(createElement(ProviderLogo, { provider: "anthropic" }));
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<text");
  });

  it("draws a user-defined group as a letter tile, with no dark-mode class", () => {
    const html = renderStatic(createElement(ProviderLogo, { provider: "team-proxy" }));
    expect(html).toContain(">T</text>");
    expect(html).toContain(`fill:${avatarTile("team-proxy").ink}`);
    expect(html).not.toContain("dark:");
  });

  // The Chinese vendor groups went out as tiles and now carry their platforms' marks. Every id
  // comes from the model catalog, where the same four are the ones with no glyph a day earlier.
  it("draws the Chinese vendor groups' own marks, not letter tiles", () => {
    for (const provider of ["xiaomi", "baidu", "tencent", "iflytek"]) {
      const html = renderStatic(createElement(ProviderLogo, { provider }));
      expect(html, provider).toContain('fill="currentColor"');
      expect(html, provider).not.toContain("<text");
    }
  });

  // Venice AI shipped as a letter tile: the vendor's site cannot be reached from this machine,
  // so its mark comes from the icon set that traces it. The two evenodd paths must survive the
  // copy — without the rule the emblem's counter-shapes fill in and it reads as a blob.
  it("draws Venice AI's mark, evenodd kept", () => {
    const html = renderStatic(createElement(ProviderLogo, { provider: "venice" }));
    expect(html).toContain('fill="currentColor"');
    expect(html).not.toContain("<text");
    expect(html.match(/fill-rule="evenodd"/g)).toHaveLength(2);
  });
});

describe("AppLogo", () => {
  it("shows the asset the app names, decoratively", () => {
    const html = renderStatic(createElement(AppLogo, { src: "/adelie-icon.svg" }));
    expect(html).toContain('src="/adelie-icon.svg"');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
  });
});
