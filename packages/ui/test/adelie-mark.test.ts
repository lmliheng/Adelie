/**
 * The inlined brand mark: it must stay the asset's own drawing. The Web App's
 * `public/adelie-icon.svg` is what the favicon, the desktop icon set and the landing page are
 * generated from, and this component is the copy the UI package draws avatars with — two copies
 * that must not drift, so every path of the asset is checked to be in the component's markup.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { AdelieMark } from "../src/components/icons/logos/adelie-mark";
import { renderStatic } from "../src/testing";
import { REPO_ROOT } from "./helpers/paths";

const ASSET = join(REPO_ROOT, "packages", "web", "public", "adelie-icon.svg");
const collapse = (s: string) => s.replace(/\s+/g, " ");

describe("AdelieMark", () => {
  it("draws every path of the brand asset", () => {
    const source = readFileSync(ASSET, "utf8");
    const html = collapse(renderStatic(createElement(AdelieMark, { size: 24 })));
    // (`\s` first, so `id="plate"` is not read as a path.)
    const paths = [...source.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(1);
    for (const d of paths) expect(html).toContain(collapse(`d="${d}"`));
  });

  it("is sized to the caller and decorative", () => {
    const html = renderStatic(createElement(AdelieMark, { size: 40, className: "rounded-full" }));
    expect(html).toContain('width="40"');
    expect(html).toContain('height="40"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("rounded-full");
  });

  it("gives each instance its own gradient ids, valid inside a url(#…) reference", () => {
    const html = renderStatic(
      createElement("div", null, createElement(AdelieMark, {}), createElement(AdelieMark, {})),
    );
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]+$/);
    for (const ref of html.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(ref[1]!);
  });
});
