/**
 * The theme registry's index: what a shared repository publishes, read the same way by the server
 * that fetches it and the page that draws its cards.
 *
 * The rules worth pinning are the ones a broken catalogue would hide: an entry pointing outside the
 * repository is refused (an index that can send a reader anywhere is an open redirect), a swatch
 * name this format does not know fails its entry rather than half-drawing a card, and one bad entry
 * fails the whole index — a list that silently lacks the theme its author just added is a support
 * question with no answer in it.
 */
import { describe, expect, it } from "vitest";
import { readThemeRegistry, resolveRegistryFile } from "../src/index.js";

const entry = {
  id: "trae-cn",
  name: "Trae CN",
  nameZh: "Trae 国产版",
  author: "lmliheng",
  description: "Near-black canvas with Trae's green accent.",
  descriptionZh: "近黑底、Trae 的绿色强调色。",
  file: "themes/trae-cn.json",
  version: "1.0.0",
  swatch: {
    light: {
      "--ui-canvas": "#f5f9fe",
      "--ui-surface": "#ffffff",
      "--ui-fg": "#0c0c0d",
      "--ui-accent": "#00a56e",
    },
    dark: {
      "--ui-canvas": "#0a0b0d",
      "--ui-surface": "#111318",
      "--ui-fg": "#edeff2",
      "--ui-accent": "#32f08c",
    },
  },
};

const index = (themes: unknown[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  name: "Adelie themes",
  updatedAt: "2026-10-28",
  themes,
  ...extra,
});

describe("readThemeRegistry", () => {
  it("reads an index into entries, swatches and all", () => {
    const read = readThemeRegistry(index([entry]));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.registry.name).toBe("Adelie themes");
    expect(read.registry.themes).toHaveLength(1);
    expect(read.registry.themes[0]).toMatchObject({
      id: "trae-cn",
      nameZh: "Trae 国产版",
      author: "lmliheng",
      file: "themes/trae-cn.json",
      version: "1.0.0",
    });
    expect(read.registry.themes[0]!.swatch?.dark?.["--ui-accent"]).toBe("#32f08c");
  });

  it("keeps the optional fields absent when the author left them out", () => {
    const read = readThemeRegistry(
      index([{ id: "plain", name: "Plain", author: "someone", file: "themes/plain.json" }]),
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.registry.themes[0]).toEqual({
      id: "plain",
      name: "Plain",
      author: "someone",
      file: "themes/plain.json",
    });
  });

  it("refuses a file path that leaves the repository", () => {
    for (const file of [
      "https://evil.example/theme.json",
      "/etc/passwd",
      "../outside.json",
      "themes/../../outside.json",
      "themes\\trae-cn.json",
      "themes/trae cn.json",
    ]) {
      const read = readThemeRegistry(index([{ ...entry, file }]));
      expect(read.ok, file).toBe(false);
      if (!read.ok) expect(read.errors.join(" ")).toContain(".file");
    }
  });

  it("refuses two entries claiming one id", () => {
    const read = readThemeRegistry(index([entry, { ...entry, file: "themes/again.json" }]));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.errors.join(" ")).toContain("出现了两次");
  });

  it("refuses a swatch name the cards cannot paint", () => {
    const read = readThemeRegistry(
      index([{ ...entry, swatch: { dark: { "--ui-primary": "#fff" } } }]),
    );
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.errors.join(" ")).toContain("不是色板里的名字");
  });

  it("refuses a swatch value that could fetch or escape its declaration", () => {
    for (const value of ["url(http://x/y.png)", "#fff;color:red", "#fff}body{"]) {
      const read = readThemeRegistry(
        index([{ ...entry, swatch: { light: { "--ui-fg": value } } }]),
      );
      expect(read.ok, value).toBe(false);
    }
  });

  it("fails the whole index — not just the bad line — when one entry is wrong", () => {
    const read = readThemeRegistry(index([entry, { ...entry, id: "Bad ID", file: "b.json" }]));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.errors.join(" ")).toContain("不是合法的主题名");
  });

  it("refuses an empty catalogue and an unknown schema", () => {
    expect(readThemeRegistry(index([])).ok).toBe(false);
    const read = readThemeRegistry(index([entry], { schemaVersion: 2 }));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.errors.join(" ")).toContain("schemaVersion");
  });

  it("needs a themes array at all", () => {
    const read = readThemeRegistry({ schemaVersion: 1 });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.errors.join(" ")).toContain("themes");
  });
});

describe("resolveRegistryFile", () => {
  it("joins the entry onto the base, normalising the trailing slash", () => {
    expect(resolveRegistryFile("https://themes.example/v1/", "themes/trae-cn.json")).toBe(
      "https://themes.example/v1/themes/trae-cn.json",
    );
    expect(resolveRegistryFile("https://themes.example/v1", "themes/trae-cn.json")).toBe(
      "https://themes.example/v1/themes/trae-cn.json",
    );
  });

  it("refuses a base that is not http(s) and a path that is not repository-relative", () => {
    expect(resolveRegistryFile("file:///etc", "themes/x.json")).toBeNull();
    expect(resolveRegistryFile("https://themes.example", "../x.json")).toBeNull();
    expect(resolveRegistryFile("https://themes.example", "/x.json")).toBeNull();
  });
});
