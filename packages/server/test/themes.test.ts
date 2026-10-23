/**
 * Imported themes over HTTP: the appearance page's list (`GET /api/themes`) and the stylesheet the
 * app links from `<head>` (`GET /api/themes.css`).
 *
 * - The directory is a data root's `themes/`: a file dropped in it needs no restart, because every
 *   request reads the directory — an installation with no such directory answers with an empty list
 *   and a sheet that is one comment, not a failed request.
 * - A file that does not read costs nobody else: it is named with its reason in the list and left
 *   out of the sheet, and the good themes beside it are still served. Two files claiming one id
 *   reject the later one, so which file paints is not decided by the filesystem's mood.
 * - The list is the app's data and stays behind the login; the sheet is the app's paint and is read
 *   before anyone signs in (the sign-in page renders under the theme too), so it is public.
 * - What the sheet says is the theme's own values, scoped to its own `data-theme` and its layers —
 *   the shape core's external-theme.test.ts pins; here it is the HTTP answer that is under test.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ImportedThemesResponse } from "../src/api/types.js";
import { apiClient, createTestApp, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

/** A theme file that reads: everything the format allows. */
const WARM_PAPER = {
  schemaVersion: 1,
  id: "warm-paper",
  name: "Warm Paper",
  nameZh: "暖纸",
  light: { "--ui-canvas": "#f7f3ec", "--ui-surface": "#fffdf8" },
  dark: { "--ui-canvas": "#16130f" },
  accents: [{ id: "terracotta", light: { "--ui-accent": "#b4552d" } }],
};

let live: TestApp[] = [];

/** An app whose data root already holds these files in `themes/` — an installation's own state. */
async function appWithThemes(files: Record<string, string | object> = {}): Promise<TestApp> {
  const t = await createTestApp({
    beforeSeed: async (root) => {
      const names = Object.keys(files);
      if (names.length === 0) return;
      const dir = path.join(root, "themes");
      await fs.mkdir(dir, { recursive: true });
      for (const name of names) {
        const body = files[name]!;
        await fs.writeFile(
          path.join(dir, name),
          typeof body === "string" ? body : JSON.stringify(body),
          "utf8",
        );
      }
    },
  });
  live.push(t);
  return t;
}

afterEach(async () => {
  const open = live;
  live = [];
  await Promise.all(open.map((t) => t.cleanup()));
});

async function listThemes(t: TestApp, cookie?: string): Promise<Response> {
  return t.app.request("/api/themes", cookie ? { headers: { cookie } } : {});
}

describe("imported themes", () => {
  it("没有 themes 目录时：列表是空的，样式表只有一句注释", async () => {
    const t = await appWithThemes();
    const { cookie } = await provisionUser(t.app, "theme_reader");

    const list = await listThemes(t, cookie);
    expect(list.status).toBe(200);
    const body = (await list.json()) as ImportedThemesResponse;
    expect(body.dir).toBe(path.join(t.root, "themes"));
    expect(body.themes).toEqual([]);
    expect(body.rejected).toEqual([]);

    const sheet = await t.app.request("/api/themes.css");
    expect(sheet.status).toBe(200);
    expect(sheet.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(await sheet.text()).toBe("/* no imported themes */\n");
  });

  it("列表要登录，样式表不用——首屏在登录之前就要上色", async () => {
    const t = await appWithThemes({ "warm-paper.json": WARM_PAPER });

    const anonymous = await listThemes(t);
    expect(anonymous.status).toBe(401);

    const sheet = await t.app.request("/api/themes.css");
    expect(sheet.status).toBe(200);
    expect(sheet.headers.get("cache-control")).toBe("no-cache");
    expect(await sheet.text()).toContain(':root[data-theme="warm-paper"]');
  });

  it("放进去一份好主题：列表里认得出它，样式表里就是它自己的值", async () => {
    const t = await appWithThemes({ "warm-paper.json": WARM_PAPER });
    const { cookie } = await provisionUser(t.app, "theme_reader");

    const body = (await (await listThemes(t, cookie)).json()) as ImportedThemesResponse;
    expect(body.rejected).toEqual([]);
    expect(body.themes.map((entry) => entry.file)).toEqual(["warm-paper.json"]);
    const theme = body.themes[0]!.theme;
    expect(theme.id).toBe("warm-paper");
    expect(theme.nameZh).toBe("暖纸");
    expect(theme.light["--ui-canvas"]).toBe("#f7f3ec");

    const css = await (await t.app.request("/api/themes.css")).text();
    // Light first and both modes in one base rule, dark only what it changes — so the sheet needs
    // no promise about which stylesheet the browser read first.
    expect(css).toContain(
      '@layer ui-theme{\n:root[data-theme="warm-paper"],:root[data-theme="warm-paper"].dark{--ui-canvas:#f7f3ec;--ui-surface:#fffdf8}\n:root[data-theme="warm-paper"].dark{--ui-canvas:#16130f}\n}',
    );
    // A preset is scoped to its own theme as well: it paints only under the theme that lists it.
    expect(css).toContain(
      '@layer ui-accent{\n:root[data-theme="warm-paper"][data-accent="terracotta"],:root[data-theme="warm-paper"][data-accent="terracotta"].dark{--ui-accent:#b4552d}\n}',
    );
  });

  it("读不了的文件只坑自己：好主题照旧上色，坏文件连原因一起报出来", async () => {
    const t = await appWithThemes({
      "warm-paper.json": WARM_PAPER,
      "broken.json": "{ this is not json",
      "risky.json": {
        schemaVersion: 1,
        id: "risky",
        name: "Risky",
        light: { "--ui-canvas": "red;background:url(http://example.test/x.png)" },
      },
      "notes.txt": "not a theme, not even read",
    });
    const { cookie } = await provisionUser(t.app, "theme_reader");

    const body = (await (await listThemes(t, cookie)).json()) as ImportedThemesResponse;
    expect(body.themes.map((entry) => entry.theme.id)).toEqual(["warm-paper"]);
    // Only the `.json` names are read at all, and each refusal carries the reason.
    expect(body.rejected.map((entry) => entry.file).sort()).toEqual(["broken.json", "risky.json"]);
    expect(body.rejected.find((entry) => entry.file === "broken.json")!.errors[0]).toContain(
      "不是合法的 JSON",
    );
    expect(body.rejected.find((entry) => entry.file === "risky.json")!.errors.join(" ")).toContain(
      "--ui-canvas",
    );

    const css = await (await t.app.request("/api/themes.css")).text();
    expect(css).toContain(':root[data-theme="warm-paper"]');
    // Nothing of the refused file reaches the sheet: not its name, not the value it tried.
    expect(css).not.toContain("risky");
    expect(css).not.toContain("example.test");
  });

  it("两个文件抢同一个主题名：后面那个被拒，先来的照常上色", async () => {
    const t = await appWithThemes({
      "a-good.json": WARM_PAPER,
      "b-clash.json": { ...WARM_PAPER, name: "Warm Paper Again" },
    });
    const { cookie } = await provisionUser(t.app, "theme_reader");

    const body = (await (await listThemes(t, cookie)).json()) as ImportedThemesResponse;
    expect(body.themes.map((entry) => entry.file)).toEqual(["a-good.json"]);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]!.file).toBe("b-clash.json");
    expect(body.rejected[0]!.errors.join(" ")).toContain("warm-paper");
  });

  it("文件是现读的：加进去、改掉、删掉都在下一次请求里生效", async () => {
    const t = await appWithThemes();
    const { cookie } = await provisionUser(t.app, "theme_reader");
    const file = path.join(t.root, "themes", "warm-paper.json");

    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(WARM_PAPER), "utf8");
    let body = (await (await listThemes(t, cookie)).json()) as ImportedThemesResponse;
    expect(body.themes.map((entry) => entry.theme.id)).toEqual(["warm-paper"]);

    await fs.writeFile(file, JSON.stringify({ ...WARM_PAPER, nameZh: "暖纸二" }), "utf8");
    body = (await (await listThemes(t, cookie)).json()) as ImportedThemesResponse;
    expect(body.themes[0]!.theme.nameZh).toBe("暖纸二");

    await fs.rm(file);
    body = (await (await listThemes(t, cookie)).json()) as ImportedThemesResponse;
    expect(body.themes).toEqual([]);
  });
});
