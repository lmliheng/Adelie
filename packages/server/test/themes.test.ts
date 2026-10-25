/**
 * Imported themes over HTTP: the appearance page's list (`GET /api/themes`), the stylesheet the
 * app links from `<head>` (`GET /api/themes.css`), and the two imports — a picked file
 * (`POST /api/themes/upload`) and an address (`POST /api/themes/download`).
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
 * - An import writes the file the directory would have held anyway, under the theme's own id, and
 *   it is judged by the reader that would have read it there (core's readExternalTheme): these
 *   tests are mostly about that equivalence — a bad file is refused with its reasons and nothing is
 *   written, an id another file claims is a 409 rather than a second claimant, and `overwrite`
 *   replaces THAT file. Both routes are the admin's; the list stays every user's.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_THEME_FILE_BYTES } from "@adelie/core";
import type { ImportedThemesResponse, ThemeImportResponse } from "../src/api/types.js";
import { apiClient, createTestApp, loginAdmin, provisionUser } from "./helpers.js";
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
  vi.unstubAllGlobals();
  const open = live;
  live = [];
  await Promise.all(open.map((t) => t.cleanup()));
});

async function listThemes(t: TestApp, cookie?: string): Promise<Response> {
  return t.app.request("/api/themes", cookie ? { headers: { cookie } } : {});
}

/** A refused request's error body, read once: the code is the contract, the message is the reason. */
async function readError(res: Response): Promise<{ code: string; message: string }> {
  const body = (await res.json()) as { error: { code: string; message: string } };
  return body.error;
}

/** Who may import and who may not: the admin, a member, and the admin's cookie for the raw list reads. */
async function importers(t: TestApp) {
  const admin = await loginAdmin(t.app);
  return {
    cookie: admin.cookie,
    admin: apiClient(t.app, admin.cookie),
    member: apiClient(t.app, (await provisionUser(t.app, "theme_member")).cookie),
  };
}

/** The upload body for one theme file, as the picked-file flow sends it. */
function uploadBody(theme: object, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { dataBase64: Buffer.from(JSON.stringify(theme), "utf8").toString("base64"), ...extra };
}

/** A response body that never declares its length, so the reader's own cap is what stops it. */
function streamed(bytes: Buffer): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    { status: 200 },
  );
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

describe("导入主题", () => {
  it("上传一份文件：按主题自己的名字落盘，列表和样式表立刻就有它", async () => {
    const t = await appWithThemes();
    const { cookie, admin } = await importers(t);

    const res = await admin.post("/api/themes/upload", uploadBody(WARM_PAPER));
    expect(res.status).toBe(201);
    const imported = (await res.json()) as ThemeImportResponse;
    expect(imported.file).toBe("warm-paper.json");
    expect(imported.theme.nameZh).toBe("暖纸");
    // The file lands exactly as it arrived — the operator's own file, not a re-serialized copy of
    // it — so what the directory holds is what they picked.
    expect(await fs.readFile(path.join(t.root, "themes", "warm-paper.json"), "utf8")).toBe(
      JSON.stringify(WARM_PAPER),
    );

    // The two reads the page does see it without a restart, which is the whole point of writing
    // into the directory the server re-reads per request.
    const body = (await (await listThemes(t, cookie)).json()) as ImportedThemesResponse;
    expect(body.themes.map((entry) => entry.file)).toEqual(["warm-paper.json"]);
    expect(await (await t.app.request("/api/themes.css")).text()).toContain(
      ':root[data-theme="warm-paper"]',
    );
  });

  it("同一个主题名再导一次：先 409 问一句，覆盖之后只有一份文件", async () => {
    const t = await appWithThemes();
    const { cookie, admin } = await importers(t);
    await admin.post("/api/themes/upload", uploadBody(WARM_PAPER));

    const updated = { ...WARM_PAPER, nameZh: "暖纸二" };
    const again = await admin.post("/api/themes/upload", uploadBody(updated));
    expect(again.status).toBe(409);
    expect((await readError(again)).code).toBe("theme_exists");
    // Without the confirmation nothing was touched: the theme still reads as it did.
    let body = (await (await listThemes(t, cookie)).json()) as ImportedThemesResponse;
    expect(body.themes[0]!.theme.nameZh).toBe("暖纸");

    const over = await admin.post("/api/themes/upload", uploadBody(updated, { overwrite: true }));
    expect(over.status).toBe(201);
    body = (await (await listThemes(t, cookie)).json()) as ImportedThemesResponse;
    expect(body.themes.map((entry) => entry.file)).toEqual(["warm-paper.json"]);
    expect(body.themes[0]!.theme.nameZh).toBe("暖纸二");
    expect(body.rejected).toEqual([]);
    expect(await fs.readdir(path.join(t.root, "themes"))).toEqual(["warm-paper.json"]);
  });

  it("别的文件占了同一个主题名：覆盖时替换的是那个文件，不再多写一份", async () => {
    const t = await appWithThemes({ "b-claims-warm-paper.json": WARM_PAPER });
    const { cookie, admin } = await importers(t);

    const other = { ...WARM_PAPER, name: "Other" };
    expect((await admin.post("/api/themes/upload", uploadBody(other))).status).toBe(409);

    const ok = await admin.post("/api/themes/upload", uploadBody(other, { overwrite: true }));
    expect(ok.status).toBe(201);
    // One file, and it is the new one: writing `<id>.json` BESIDE the claimant would have left two
    // files claiming one id, of which the reader serves the earlier — a successful import that
    // paints the old theme.
    const body = (await (await listThemes(t, cookie)).json()) as ImportedThemesResponse;
    expect(body.themes.map((entry) => entry.file)).toEqual(["warm-paper.json"]);
    expect(body.themes[0]!.theme.name).toBe("Other");
    expect(body.rejected).toEqual([]);
    expect(await fs.readdir(path.join(t.root, "themes"))).toEqual(["warm-paper.json"]);
  });

  it("读不出来的文件：连原因一起拒掉，一个字节都不落盘", async () => {
    const t = await appWithThemes();
    const { admin } = await importers(t);

    const notJson = await admin.post("/api/themes/upload", {
      dataBase64: Buffer.from("{ nope", "utf8").toString("base64"),
    });
    expect(notJson.status).toBe(400);
    const notJsonError = await readError(notJson);
    expect(notJsonError.code).toBe("theme_invalid");
    expect(notJsonError.message).toContain("不是合法的 JSON");

    // The reader's own reasons, all of them, rather than a generic refusal: the author of the file
    // is who has to fix it.
    const wrongShape = await admin.post("/api/themes/upload", {
      dataBase64: Buffer.from(
        JSON.stringify({ id: "Warm Paper", name: "x", light: {} }),
        "utf8",
      ).toString("base64"),
    });
    expect(wrongShape.status).toBe(400);
    const message = (await readError(wrongShape)).message;
    expect(message).toContain("id");
    expect(message).toContain("light");

    // Not one byte: the directory was never even created.
    await expect(fs.readdir(path.join(t.root, "themes"))).rejects.toThrow();
  });

  it("超过格式上限：413，而且按解码后的字节算", async () => {
    const t = await appWithThemes();
    const { admin } = await importers(t);
    const res = await admin.post("/api/themes/upload", {
      dataBase64: Buffer.alloc(MAX_THEME_FILE_BYTES + 1, 0x20).toString("base64"),
    });
    expect(res.status).toBe(413);
    expect((await readError(res)).code).toBe("theme_too_large");
  });

  it("两个导入只有管理员能做，读列表照旧谁都可以", async () => {
    const t = await appWithThemes();
    const { admin, member } = await importers(t);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect((await member.post("/api/themes/upload", uploadBody(WARM_PAPER))).status).toBe(403);
    const refused = await member.post("/api/themes/upload", uploadBody(WARM_PAPER));
    expect((await readError(refused)).code).toBe("admin_required");
    const memberDownload = await member.post("/api/themes/download", {
      url: "https://themes.example.test/warm.json",
    });
    expect(memberDownload.status).toBe(403);
    // Refused before anything left the machine.
    expect(fetchSpy).not.toHaveBeenCalled();

    // The list is every user's screen, and the admin's own import still works.
    expect((await member.get("/api/themes")).status).toBe(200);
    expect((await admin.get("/api/themes")).status).toBe(200);
  });

  it("从地址导入：服务端取回来，落成和上传完全相同的一份", async () => {
    const t = await appWithThemes();
    const { cookie, admin } = await importers(t);
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input));
      return new Response(JSON.stringify(WARM_PAPER), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const res = await admin.post("/api/themes/download", {
      url: "https://themes.example.test/themes/warm.json",
    });
    expect(res.status).toBe(201);
    expect(calls).toEqual(["https://themes.example.test/themes/warm.json"]);
    // The file name comes from the theme, not from the URL's last segment: an address and a picked
    // file install the same thing.
    expect(((await res.json()) as ThemeImportResponse).file).toBe("warm-paper.json");
    const body = (await (await listThemes(t, cookie)).json()) as ImportedThemesResponse;
    expect(body.themes.map((entry) => entry.theme.id)).toEqual(["warm-paper"]);
  });

  it("从地址取回来的不是主题：按同一个读法给出原因", async () => {
    const t = await appWithThemes();
    const { admin } = await importers(t);

    vi.stubGlobal("fetch", async () => new Response("<html>nope</html>", { status: 200 }));
    const html = await admin.post("/api/themes/download", {
      url: "https://themes.example.test/x.json",
    });
    expect(html.status).toBe(400);
    expect((await readError(html)).code).toBe("theme_invalid");

    vi.stubGlobal("fetch", async () => new Response("gone", { status: 404 }));
    const missing = await admin.post("/api/themes/download", {
      url: "https://themes.example.test/x.json",
    });
    expect(missing.status).toBe(400);
    expect((await readError(missing)).code).toBe("download_failed");

    vi.stubGlobal("fetch", async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });
    const unreachable = await admin.post("/api/themes/download", {
      url: "https://themes.example.test/x.json",
    });
    expect(unreachable.status).toBe(400);
    expect((await readError(unreachable)).code).toBe("download_failed");

    const notAUrl = await admin.post("/api/themes/download", { url: "file:///etc/passwd" });
    expect(notAUrl.status).toBe(400);
    expect((await readError(notAUrl)).code).toBe("unsupported_url");
  });

  it("地址是内网、或者回来的东西太大：都不落盘", async () => {
    const t = await appWithThemes();
    const { admin } = await importers(t);

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const blocked = await admin.post("/api/themes/download", {
      url: "http://127.0.0.1:7364/api/themes",
    });
    expect(blocked.status).toBe(400);
    expect((await readError(blocked)).code).toBe("blocked_url");
    expect(fetchSpy).not.toHaveBeenCalled();

    // A declared length past the cap: refused before reading the body.
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("x", {
          status: 200,
          headers: { "content-length": String(MAX_THEME_FILE_BYTES * 4) },
        }),
    );
    const declared = await admin.post("/api/themes/download", {
      url: "https://themes.example.test/big.json",
    });
    expect(declared.status).toBe(413);
    expect((await readError(declared)).code).toBe("theme_too_large");

    // A length that is not declared at all (a chunked body): the cap has to hold while streaming,
    // because a `content-length` is only a claim.
    vi.stubGlobal("fetch", async () => streamed(Buffer.alloc(MAX_THEME_FILE_BYTES * 2, 0x20)));
    const streamedTooBig = await admin.post("/api/themes/download", {
      url: "https://themes.example.test/big.json",
    });
    expect(streamedTooBig.status).toBe(413);
    expect((await readError(streamedTooBig)).code).toBe("theme_too_large");

    await expect(fs.readdir(path.join(t.root, "themes"))).rejects.toThrow();
  });
});
