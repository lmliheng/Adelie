/**
 * The remote theme registry, service and routes: the catalogue read (`GET /api/themes/registry`)
 * and the install by id (`POST /api/themes/registry/import`).
 *
 * - What a registry changes is where a file's ADDRESS comes from. These tests are mostly about that
 *   equivalence holding: an id imports the file the index points at, written by the same reader and
 *   the same writer as the address import, landing under the theme's own `<id>.json`.
 * - A catalogue nobody can reach is an answer with its reason, not a failed request: the page still
 *   has this installation's themes to show.
 * - The index is checked by core's reader (all or nothing), so an index that half-reads is refused
 *   with the reasons rather than shown with entries missing.
 * - The index is cached (five minutes; thirty seconds for a failure) and a theme file never is: an
 *   import is a deliberate act and must fetch the file it is about right then.
 * - A file whose own id is not the one the index listed it under is refused before anything is
 *   written — the card the operator clicked has to be the theme that lands.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportedThemesResponse, ThemeRegistryResponse } from "../src/api/types.js";
import {
  DEFAULT_THEME_REGISTRY_BASE,
  createThemeRegistry,
  registryBaseUrl,
} from "../src/services/theme-registry.js";
import { apiClient, createTestApp, loginAdmin, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

/** A theme file that reads: everything the format needs. */
const TRAE_THEME = {
  schemaVersion: 1,
  id: "trae-cn",
  name: "Trae CN",
  nameZh: "Trae 国内版",
  light: { "--ui-canvas": "#f5f9fe", "--ui-accent": "#00a56e" },
  dark: { "--ui-canvas": "#0a0b0d", "--ui-accent": "#32f08c" },
};

/** The catalogue that points at it. */
const INDEX = {
  schemaVersion: 1,
  name: "Adelie 主题库",
  updatedAt: "2026-10-29",
  themes: [
    {
      id: "trae-cn",
      name: "Trae CN",
      nameZh: "Trae 国内版",
      author: "lmliheng",
      description: "Trae's near-black greys with its brand green",
      descriptionZh: "Trae 的近黑灰底配品牌绿",
      file: "themes/trae-cn.json",
      version: "1.0.0",
      swatch: {
        light: { "--ui-canvas": "#f5f9fe", "--ui-accent": "#00a56e" },
        dark: { "--ui-canvas": "#0a0b0d", "--ui-accent": "#32f08c" },
      },
    },
  ],
};

const INDEX_URL = `${DEFAULT_THEME_REGISTRY_BASE}index.json`;
const THEME_URL = `${DEFAULT_THEME_REGISTRY_BASE}themes/trae-cn.json`;
/** The second address the client falls back to when the npm mirror has not synced yet. */
const JSDELIVR_BASE = "https://cdn.jsdelivr.net/gh/lmliheng/adelie-themes@main/";
const JSDELIVR_INDEX_URL = `${JSDELIVR_BASE}index.json`;
const JSDELIVR_THEME_URL = `${JSDELIVR_BASE}themes/trae-cn.json`;

let live: TestApp[] = [];

async function appWithThemes(files: Record<string, object> = {}): Promise<TestApp> {
  const t = await createTestApp({
    beforeSeed: async (root) => {
      const names = Object.keys(files);
      if (names.length === 0) return;
      const dir = path.join(root, "themes");
      await fs.mkdir(dir, { recursive: true });
      for (const name of names) {
        await fs.writeFile(path.join(dir, name), JSON.stringify(files[name]), "utf8");
      }
    },
  });
  live.push(t);
  return t;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  const open = live;
  live = [];
  await Promise.all(open.map((t) => t.cleanup()));
});

/** A registry host: URL in, these files out — and every address it was asked for, in order. */
function registryHost(files: Record<string, object | string>): {
  calls: string[];
  fetchImpl: typeof fetch;
} {
  const calls: string[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    calls.push(url);
    const body = files[url];
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

async function cookieFor(t: TestApp): Promise<string> {
  return (await provisionUser(t.app, "theme_reader")).cookie;
}

async function readRegistry(t: TestApp, cookie?: string): Promise<ThemeRegistryResponse> {
  const res = await t.app.request("/api/themes/registry", cookie ? { headers: { cookie } } : {});
  expect(res.status).toBe(200);
  return (await res.json()) as ThemeRegistryResponse;
}

async function readError(res: Response): Promise<{ code: string; message: string }> {
  const body = (await res.json()) as { error: { code: string; message: string } };
  return body.error;
}

describe("主题库目录", () => {
  it("目录读进来：卡片要的资料齐了，已装的那一条标出来", async () => {
    const t = await appWithThemes({ "trae-cn.json": TRAE_THEME });
    const cookie = await cookieFor(t);
    const { calls, fetchImpl } = registryHost({
      [INDEX_URL]: INDEX,
      [THEME_URL]: TRAE_THEME,
    });
    vi.stubGlobal("fetch", fetchImpl);

    const body = await readRegistry(t, cookie);
    expect(body.base).toBe(DEFAULT_THEME_REGISTRY_BASE);
    expect(body.name).toBe("Adelie 主题库");
    expect(body.error).toBeUndefined();
    expect(calls).toEqual([INDEX_URL]);
    expect(body.themes).toHaveLength(1);
    const entry = body.themes[0]!;
    expect(entry.id).toBe("trae-cn");
    expect(entry.nameZh).toBe("Trae 国内版");
    expect(entry.file).toBe("themes/trae-cn.json");
    expect(entry.swatch?.dark?.["--ui-accent"]).toBe("#32f08c");
    // Already imported on this installation — the card offers "重新导入" rather than "导入".
    expect(entry.installed).toBe(true);
    // Reading a catalogue fetches no theme file.
    expect(calls).not.toContain(THEME_URL);
  });

  it("只有登录过的用户能看，客人看目录之前什么都不会出去", async () => {
    const t = await appWithThemes();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const anonymous = await t.app.request("/api/themes/registry");
    expect(anonymous.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("目录读不到：还是一个回答，带上原因，主题列表是空的", async () => {
    const t = await appWithThemes();
    const cookie = await cookieFor(t);

    vi.stubGlobal("fetch", async () => new Response("gone", { status: 404 }));
    let body = await readRegistry(t, cookie);
    expect(body.themes).toEqual([]);
    expect(body.error?.code).toBe("registry_unavailable");

    vi.stubGlobal("fetch", async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });
    body = await readRegistry(t, cookie);
    expect(body.error?.code).toBe("registry_unavailable");
  });

  it("目录不是 JSON：说读不出来，而不是当成空目录", async () => {
    const t = await appWithThemes();
    const cookie = await cookieFor(t);
    vi.stubGlobal("fetch", async () => new Response("{ not json", { status: 200 }));

    const body = await readRegistry(t, cookie);
    expect(body.error?.code).toBe("registry_invalid");
    expect(body.error?.message).toContain("JSON");
  });

  it("目录里有一条不合规：按 core 的读法把原因一条条列出来，不是少几条了事", async () => {
    const t = await appWithThemes();
    const cookie = await cookieFor(t);

    // A path out of the repository, and a colour value that is CSS rather than a colour: the whole
    // index is refused, with both reasons named.
    const { fetchImpl } = registryHost({
      [INDEX_URL]: {
        schemaVersion: 1,
        themes: [
          { id: "one", name: "One", author: "a", file: "../escape.json" },
          {
            id: "two",
            name: "Two",
            author: "a",
            file: "themes/two.json",
            swatch: { light: { "--ui-accent": "red;background:url(http://x.test/a.png)" } },
          },
        ],
      },
    });
    vi.stubGlobal("fetch", fetchImpl);

    const body = await readRegistry(t, cookie);
    expect(body.error?.code).toBe("registry_invalid");
    expect(body.error?.message).toContain("file");
    expect(body.error?.message).toContain("--ui-accent");
    expect(body.themes).toEqual([]);
  });

  it("第一个地址不通就退到第二个：同一份目录，换一条路进来", async () => {
    const t = await appWithThemes();
    const cookie = await cookieFor(t);
    // The npm mirror has not synced this release yet (a 404), jsDelivr's GitHub copy has it.
    const { calls, fetchImpl } = registryHost({
      [JSDELIVR_INDEX_URL]: INDEX,
      [JSDELIVR_THEME_URL]: TRAE_THEME,
    });
    vi.stubGlobal("fetch", fetchImpl);

    const body = await readRegistry(t, cookie);
    expect(body.error).toBeUndefined();
    expect(body.base).toBe("https://cdn.jsdelivr.net/gh/lmliheng/adelie-themes@main/");
    expect(calls).toEqual([INDEX_URL, JSDELIVR_INDEX_URL]);
    // ... and an import fetches from the address that answered, not from the first one.
    const admin = await loginAdmin(t.app);
    const res = await apiClient(t.app, admin.cookie).post("/api/themes/registry/import", {
      id: "trae-cn",
    });
    expect(res.status).toBe(201);
    expect(calls).toEqual([INDEX_URL, JSDELIVR_INDEX_URL, JSDELIVR_THEME_URL]);
  });

  it("目录有缓存：五分钟内两次读只走一次网络", async () => {
    const t = await appWithThemes();
    const cookie = await cookieFor(t);
    const { calls, fetchImpl } = registryHost({ [INDEX_URL]: INDEX });
    vi.stubGlobal("fetch", fetchImpl);

    await readRegistry(t, cookie);
    await readRegistry(t, cookie);
    expect(calls).toEqual([INDEX_URL]);
  });
});

describe("从主题库导入", () => {
  it("按 id 导入：取的是目录指向的那份文件，落成和地址导入完全相同的一份", async () => {
    const t = await appWithThemes();
    const admin = await loginAdmin(t.app);
    const { calls, fetchImpl } = registryHost({
      [INDEX_URL]: INDEX,
      [THEME_URL]: TRAE_THEME,
    });
    vi.stubGlobal("fetch", fetchImpl);

    const res = await apiClient(t.app, admin.cookie).post("/api/themes/registry/import", {
      id: "trae-cn",
    });
    expect(res.status).toBe(201);
    const imported = (await res.json()) as { file: string; theme: { id: string } };
    expect(imported.file).toBe("trae-cn.json");
    expect(imported.theme.id).toBe("trae-cn");
    expect(calls).toEqual([INDEX_URL, THEME_URL]);
    // The file is the registry's own bytes, written under the theme's id.
    expect(await fs.readFile(path.join(t.root, "themes", "trae-cn.json"), "utf8")).toBe(
      JSON.stringify(TRAE_THEME),
    );
    // And it paints: the sheet the page links carries it.
    const css = await (await t.app.request("/api/themes.css")).text();
    expect(css).toContain(':root[data-theme="trae-cn"]');

    const list = (await (
      await t.app.request("/api/themes", { headers: { cookie: admin.cookie } })
    ).json()) as ImportedThemesResponse;
    expect(list.themes.map((entry) => entry.theme.id)).toEqual(["trae-cn"]);
    // The catalogue now says it is installed.
    expect((await readRegistry(t, admin.cookie)).themes[0]!.installed).toBe(true);
  });

  it("导第二次：先 409 问一句，overwrite 之后还是一份文件", async () => {
    const t = await appWithThemes({ "trae-cn.json": TRAE_THEME });
    const admin = await loginAdmin(t.app);
    const { fetchImpl } = registryHost({ [INDEX_URL]: INDEX, [THEME_URL]: TRAE_THEME });
    vi.stubGlobal("fetch", fetchImpl);
    const client = apiClient(t.app, admin.cookie);

    const again = await client.post("/api/themes/registry/import", { id: "trae-cn" });
    expect(again.status).toBe(409);
    expect((await readError(again)).code).toBe("theme_exists");

    const over = await client.post("/api/themes/registry/import", {
      id: "trae-cn",
      overwrite: true,
    });
    expect(over.status).toBe(201);
    expect(await fs.readdir(path.join(t.root, "themes"))).toEqual(["trae-cn.json"]);
  });

  it("目录里没有这个 id：404，一个字节都不去取", async () => {
    const t = await appWithThemes();
    const admin = await loginAdmin(t.app);
    const { calls, fetchImpl } = registryHost({ [INDEX_URL]: INDEX });
    vi.stubGlobal("fetch", fetchImpl);

    const res = await apiClient(t.app, admin.cookie).post("/api/themes/registry/import", {
      id: "no-such-theme",
    });
    expect(res.status).toBe(404);
    expect((await readError(res)).code).toBe("registry_theme_not_found");
    expect(calls).toEqual([INDEX_URL]);
  });

  it("目录指向的文件自称别的名字：拒掉，不落盘", async () => {
    const t = await appWithThemes();
    const admin = await loginAdmin(t.app);
    const { fetchImpl } = registryHost({
      [INDEX_URL]: INDEX,
      [THEME_URL]: { ...TRAE_THEME, id: "someone-else" },
    });
    vi.stubGlobal("fetch", fetchImpl);

    const res = await apiClient(t.app, admin.cookie).post("/api/themes/registry/import", {
      id: "trae-cn",
    });
    expect(res.status).toBe(400);
    expect((await readError(res)).code).toBe("registry_mismatch");
    await expect(fs.readdir(path.join(t.root, "themes"))).rejects.toThrow();
  });

  it("目录读不到的时候：导入不成，原因和列表那边一样", async () => {
    const t = await appWithThemes();
    const admin = await loginAdmin(t.app);
    vi.stubGlobal("fetch", async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });

    const res = await apiClient(t.app, admin.cookie).post("/api/themes/registry/import", {
      id: "trae-cn",
    });
    expect(res.status).toBe(400);
    expect((await readError(res)).code).toBe("registry_unavailable");
  });

  it("导入只有管理员能做：别人点了按钮，连目录都不去取", async () => {
    const t = await appWithThemes();
    const member = apiClient(t.app, (await provisionUser(t.app, "theme_member")).cookie);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await member.post("/api/themes/registry/import", { id: "trae-cn" });
    expect(res.status).toBe(403);
    expect((await readError(res)).code).toBe("admin_required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("主题库地址与缓存", () => {
  it("默认是 npmmirror 上的包文件；环境变量可以整条换掉", () => {
    expect(registryBaseUrl({})).toBe(DEFAULT_THEME_REGISTRY_BASE);
    expect(registryBaseUrl({ ADELIE_THEME_REGISTRY: "" })).toBe(DEFAULT_THEME_REGISTRY_BASE);
    expect(registryBaseUrl({ ADELIE_THEME_REGISTRY: "https://mirror.test/themes" })).toBe(
      "https://mirror.test/themes",
    );
    // Something that is not an http(s) address is reported rather than replaced by the default: an
    // operator who set it meant it.
    expect(registryBaseUrl({ ADELIE_THEME_REGISTRY: "file:///srv/themes" })).toBeNull();
    expect(registryBaseUrl({ ADELIE_THEME_REGISTRY: "not a url" })).toBeNull();
  });

  it("失败只记三十秒：网络抖一下不该让目录消失五分钟", async () => {
    let clock = 0;
    let ok = false;
    const fetchImpl = (async () =>
      ok
        ? new Response(JSON.stringify(INDEX), { status: 200 })
        : new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const client = createThemeRegistry({
      base: "https://registry.test/",
      fetchImpl,
      now: () => clock,
    });

    expect((await client.read()).ok).toBe(false);
    clock = 10_000;
    expect((await client.read()).ok).toBe(false);
    // Past the failure window the catalogue is asked for again — and now it answers.
    ok = true;
    clock = 31_000;
    const load = await client.read();
    expect(load.ok).toBe(true);
    // ... and then the successful answer holds for the full five minutes.
    clock = 31_000 + 4 * 60_000;
    expect((await client.read()).ok).toBe(true);
  });

  it("同一个时刻的两次读共用一次请求，不各自去敲网络", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      await gate;
      return new Response(JSON.stringify(INDEX), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createThemeRegistry({ base: "https://registry.test/", fetchImpl });

    const both = Promise.all([client.read(), client.read()]);
    await new Promise((done) => setTimeout(done, 0));
    expect(calls).toBe(1);
    release!();
    const [first, second] = await both;
    expect(first.ok && second.ok).toBe(true);
    expect(calls).toBe(1);
  });
});
