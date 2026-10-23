/**
 * Imported themes (src/internal/external-theme.ts).
 *
 * Two things break without a test here and neither shows up on the machine that wrote the file: a
 * value that escapes its declaration (the file becomes CSS once it is served, so `red} body{…`
 * would repaint — or unhide — anything), and a base rule that does not reach dark mode (the
 * theme's own value would lose to Primer's `.dark` rule, which is the one thing an imported theme
 * is allowed to assume it beats).
 */
import { describe, expect, it } from "vitest";
import {
  THEME_ID_PATTERN,
  externalThemeCss,
  externalThemesCss,
  isThemeId,
  readExternalTheme,
} from "../src/internal/external-theme.js";

const VALID = {
  schemaVersion: 1,
  id: "warm-paper",
  name: "Warm paper",
  nameZh: "暖纸",
  light: { "--ui-canvas": "#f7f2e8", "--ui-accent": "#a4471f", "--ui-fg": "#2b2620" },
  dark: { "--ui-canvas": "#1a1713", "--ui-fg": "#ece6dc" },
  accents: [
    { id: "clay", light: { "--ui-accent": "#b8552f" }, dark: { "--ui-accent": "#d9906c" } },
  ],
};

function read(value: unknown) {
  const result = readExternalTheme(value);
  if (!result.ok) throw new Error(`expected ok, got: ${result.errors.join(" / ")}`);
  return result.theme;
}

describe("readExternalTheme", () => {
  it("reads a whole file, keeping the optional parts", () => {
    const theme = read(VALID);
    expect(theme.id).toBe("warm-paper");
    expect(theme.nameZh).toBe("暖纸");
    expect(theme.dark?.["--ui-canvas"]).toBe("#1a1713");
    expect(theme.accents?.[0]?.id).toBe("clay");
  });

  it("reads a file that only sets light values", () => {
    const theme = read({ id: "bare", name: "Bare", light: { "--ui-canvas": "#ffffff" } });
    expect(theme.dark).toBeUndefined();
    // One rule, whose selector list already reaches dark mode: no second `.dark` rule.
    expect(externalThemeCss(theme).match(/\.dark\{/g)).toHaveLength(1);
  });

  it("refuses a value that would leave its declaration", () => {
    for (const value of [
      "#fff; } body { display: none",
      "url(https://example.com/x.png)",
      "image-set(url(a.png) 1x)",
      "@import 'x.css'",
      "red}",
      "back\\slash",
      "<script>",
      "#fff\n--ui-accent: red",
    ]) {
      const result = readExternalTheme({
        id: "escape",
        name: "Escape",
        light: { "--ui-canvas": value },
      });
      expect(result.ok, value).toBe(false);
    }
  });

  it("refuses names that are not spelled like a token", () => {
    const result = readExternalTheme({ id: "x", name: "X", light: { "ui-canvas": "#fff" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("ui-canvas");
  });

  it("refuses ids that are not ids", () => {
    for (const id of ["Warm", "9lives", "-lead", "a".repeat(33), ""]) {
      const result = readExternalTheme({ ...VALID, id });
      expect(result.ok, id).toBe(false);
    }
    // The shipped ids are legal ids (the module has no list of its own): an imported theme that
    // takes one simply never matches, because its rules are scoped to its own data-theme.
    expect(readExternalTheme({ ...VALID, id: "github" }).ok).toBe(true);
  });

  it("refuses a file with no light values, no name, or an unknown schemaVersion", () => {
    expect(readExternalTheme({ ...VALID, light: {} }).ok).toBe(false);
    expect(readExternalTheme({ ...VALID, name: "" }).ok).toBe(false);
    expect(readExternalTheme({ ...VALID, schemaVersion: 2 }).ok).toBe(false);
    expect(readExternalTheme([]).ok).toBe(false);
    expect(readExternalTheme("hi").ok).toBe(false);
  });

  it("refuses `neutral`, duplicate and malformed accents", () => {
    const result = readExternalTheme({
      ...VALID,
      accents: [
        { id: "neutral", light: { "--ui-accent": "#111111" } },
        { id: "clay", light: { "--ui-accent": "#b8552f" } },
        { id: "clay", light: { "--ui-accent": "#999999" } },
        { id: "Slate", light: { "--ui-accent": "#5c6470" } },
        { id: "honey", light: {} },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const all = result.errors.join("\n");
      expect(all).toContain("neutral");
      expect(all).toContain("两次");
      expect(all).toContain("Slate");
    }
  });

  it("caps a runaway file instead of turning it into a stylesheet", () => {
    const many = Object.fromEntries(
      Array.from({ length: 401 }, (_v, i) => [`--ui-token-${i}`, "#ffffff"]),
    );
    expect(readExternalTheme({ id: "huge", name: "Huge", light: many }).ok).toBe(false);
    const thirteen = Array.from({ length: 13 }, (_v, i) => ({
      id: `accent-${i}`,
      light: { "--ui-accent": "#ffffff" },
    }));
    expect(readExternalTheme({ ...VALID, accents: thirteen }).ok).toBe(false);
  });
});

describe("externalThemeCss", () => {
  it("writes the base rule for both modes and the accent presets into their layers", () => {
    const css = externalThemeCss(read(VALID));
    expect(css).toContain("@layer ui-theme{");
    expect(css).toContain("@layer ui-accent{");
    // The base rule reaches dark mode by itself: :root[data-theme="warm-paper"].dark is in the
    // SAME selector list as the light one, so a name dark does not change keeps the theme's value
    // rather than falling back to Primer's `.dark` rule.
    expect(css).toContain(
      ':root[data-theme="warm-paper"],:root[data-theme="warm-paper"].dark{--ui-canvas:#f7f2e8;--ui-accent:#a4471f;--ui-fg:#2b2620}',
    );
    expect(css).toContain(
      ':root[data-theme="warm-paper"].dark{--ui-canvas:#1a1713;--ui-fg:#ece6dc}',
    );
    expect(css).toContain(
      ':root[data-theme="warm-paper"][data-accent="clay"],:root[data-theme="warm-paper"][data-accent="clay"].dark{--ui-accent:#b8552f}',
    );
    expect(css).toContain(
      ':root[data-theme="warm-paper"][data-accent="clay"].dark{--ui-accent:#d9906c}',
    );
    // Nothing is emitted outside a layer: an unlayered rule would beat `ui-font`, where the user's
    // own font pairing lives.
    let depth = 0;
    const outside: string[] = [];
    for (const line of css.split("\n")) {
      if (depth === 0 && line !== "" && !line.startsWith("/*") && !line.startsWith("@layer ")) {
        outside.push(line);
      }
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    }
    expect(outside).toEqual([]);
    expect(depth).toBe(0);
  });

  it("says so when there is nothing to serve", () => {
    expect(externalThemesCss([])).toContain("no imported themes");
    expect(externalThemesCss([read(VALID)])).toContain('data-theme="warm-paper"');
  });
});

describe("the id pattern", () => {
  it("accepts the shipped ids and what an author would plausibly write, refusing the rest", () => {
    for (const id of ["github", "modern", "geek", "warm-paper", "a", "x-9-9"]) {
      expect(isThemeId(id), id).toBe(true);
    }
    for (const id of ["", "-a", "A", "a b", "a_b", "a.b", "a".repeat(33), 7, null, undefined]) {
      expect(isThemeId(id), String(id)).toBe(false);
    }
    expect(THEME_ID_PATTERN.source).toBe("^[a-z][a-z0-9-]{0,31}$");
  });
});
