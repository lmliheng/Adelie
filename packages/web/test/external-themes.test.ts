/**
 * The themes an installation imported (state/external-themes.ts): the contract judgement, the
 * swatches the pickers paint, and the read that fills the page's list.
 *
 * - The judgement no other layer can make: a name the token contract has never heard of is
 *   reported (it paints nothing), while a name a theme leaves out is only listed as missing (it
 *   keeps the default theme's value). Names are collected across light, dark and every accent
 *   preset, once each.
 * - The accents a picker offers: a shipped theme's come from the package's own tables, an imported
 *   one's from its file (a preset with no `--ui-accent` of its own shows the theme's accent, which
 *   is what the page paints), and an id nothing provides offers only the theme's own — the default
 *   theme's own, since that is the accent the CSS ends up using.
 * - The read: one request per page load however many components ask, a failed request says so
 *   rather than claiming an empty directory, and "read again" goes back for a fresh answer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCENT_PRESETS, THEME_OWN_ACCENTS, TOKEN_NAMES } from "@adelie/ui";
import type { ExternalTheme } from "@adelie/core";
import {
  accentSwatches,
  importedThemes,
  refreshImportedThemes,
  resetImportedThemes,
  viewOfTheme,
} from "../src/state/external-themes";

afterEach(() => resetImportedThemes());

/** A theme file that sets one name of the contract and nothing else, for the warning cases. */
function themeFile(overrides: Partial<ExternalTheme> = {}): ExternalTheme {
  return {
    id: "warm-paper",
    name: "Warm Paper",
    light: { "--ui-canvas": "#f7f3ec" },
    ...overrides,
  };
}

describe("what an imported theme file gets wrong", () => {
  it("reports names the contract has never heard of, once each, from every map in the file", () => {
    const view = viewOfTheme(
      "warm-paper.json",
      themeFile({
        light: { "--ui-canvas": "#f7f3ec", "--ui-paper-grain": "4px" },
        dark: { "--ui-canvas": "#16130f", "--ui-paper-grain": "6px" },
        accents: [{ id: "terracotta", light: { "--ui-accent": "#b4552d", "--ui-clay": "#c06" } }],
      }),
    );
    expect(view.unknown).toEqual(["--ui-paper-grain", "--ui-clay"]);
    expect(view.file).toBe("warm-paper.json");
    expect(view.nameZh).toBeUndefined();
  });

  it("lists the names a theme leaves out, because they keep the default theme's values", () => {
    const view = viewOfTheme("warm-paper.json", themeFile());
    expect(view.missing).toContain("--ui-surface");
    expect(view.missing).not.toContain("--ui-canvas");
    // Everything the file does not set is the contract minus its light keys — no more, no less.
    expect(view.missing.length).toBe(TOKEN_NAMES.length - 1);
  });
});

describe("the accents a picker paints", () => {
  it("takes a shipped theme's swatches from the package", () => {
    for (const mode of ["light", "dark"] as const) {
      const dark = mode === "dark";
      const swatches = accentSwatches("github", dark, []);
      expect(swatches[0]).toEqual({ value: "neutral", color: THEME_OWN_ACCENTS.github[mode] });
      expect(swatches.slice(1)).toEqual(
        ACCENT_PRESETS.github.map((preset) => ({ value: preset.id, color: preset.swatch })),
      );
    }
  });

  it("takes an imported theme's swatches from its file, falling back to the theme's own accent", () => {
    const view = viewOfTheme(
      "warm-paper.json",
      themeFile({
        light: { "--ui-canvas": "#f7f3ec", "--ui-accent": "#8a4b2a" },
        dark: { "--ui-accent": "#d98a63" },
        accents: [
          { id: "terracotta", light: { "--ui-accent": "#b4552d" } },
          // No `--ui-accent`: the rule paints nothing, so the theme's own accent is what shows.
          { id: "plain", light: { "--ui-canvas": "#fffdf8" } },
        ],
      }),
    );
    expect(accentSwatches("warm-paper", false, [view])).toEqual([
      { value: "neutral", color: "#8a4b2a" },
      { value: "terracotta", color: "#b4552d" },
      { value: "plain", color: "#8a4b2a" },
    ]);
    // Dark gets its own "theme's own" swatch; the presets keep the light values they declare.
    expect(accentSwatches("warm-paper", true, [view])[0]).toEqual({
      value: "neutral",
      color: "#d98a63",
    });
  });

  it("falls back to the default theme's own accent when the file sets none", () => {
    const view = viewOfTheme("half.json", themeFile({ id: "half" }));
    expect(accentSwatches("half", false, [view])).toEqual([
      { value: "neutral", color: THEME_OWN_ACCENTS.github.light },
    ]);
  });

  it("offers only the theme's own for an id nothing provides", () => {
    expect(accentSwatches("gone", false, [])).toEqual([
      { value: "neutral", color: THEME_OWN_ACCENTS.github.light },
    ]);
    expect(accentSwatches("gone", true, [])).toEqual([
      { value: "neutral", color: THEME_OWN_ACCENTS.github.dark },
    ]);
  });
});

describe("reading the list", () => {
  const answer = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("fills the list from one request, however many callers ask", async () => {
    const fetchMock = vi.fn(async () =>
      answer({
        dir: "/data/themes",
        themes: [{ file: "warm-paper.json", theme: themeFile() }],
        rejected: [{ file: "broken.json", errors: ["不是合法的 JSON"] }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([refreshImportedThemes(), refreshImportedThemes()]);
    const state = importedThemes();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.dir).toBe("/data/themes");
    expect(state.themes.map((theme) => theme.id)).toEqual(["warm-paper"]);
    expect(state.rejected[0]!.file).toBe("broken.json");
    expect(state.failed).toBe(false);

    // Nothing asks again on its own; "read again" is the one way to a second request.
    await refreshImportedThemes();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await refreshImportedThemes(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says the read failed rather than claiming the directory is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer({ error: { code: "nope", message: "nope" } }, 500)),
    );
    await refreshImportedThemes();
    expect(importedThemes().failed).toBe(true);
    expect(importedThemes().dir).toBeNull();
  });

  it("读过之后是「再来一次」时，把页面链接的那张样式表也重挂一遍", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer({ dir: "/data/themes", themes: [], rejected: [] })),
    );
    // A stylesheet is fetched once per document, so the sheet the page already applied is the one
    // from load — an import that lands afterwards paints nothing until the link is re-pointed.
    const hrefs: string[] = [];
    const link = {
      setAttribute: (name: string, value: string) => hrefs.push(`${name}=${value}`),
    };
    const querySelector = vi.fn(() => link);
    vi.stubGlobal("document", { querySelector });

    // A plain read is the page load's own: the sheet is the one it just fetched, nothing to redo.
    await refreshImportedThemes();
    expect(querySelector).not.toHaveBeenCalled();
    expect(hrefs).toEqual([]);

    await refreshImportedThemes(true);
    expect(querySelector).toHaveBeenCalledWith('link[rel="stylesheet"][href^="/api/themes.css"]');
    expect(hrefs).toHaveLength(1);
    expect(hrefs[0]!).toMatch(/^href=\/api\/themes\.css\?again=\d+$/);
  });
});
