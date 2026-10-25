/**
 * Imported themes: what an installation put in `<data root>/themes/`.
 *
 *   GET  /api/themes           the list, for the appearance page (auth: user)
 *   GET  /api/themes.css       the same files as one stylesheet (auth: none)
 *   POST /api/themes/upload    install one from a file the operator picked (auth: admin)
 *   POST /api/themes/download  install one fetched from an address (auth: admin)
 *
 * THE TWO IMPORTS ARE THE DIRECTORY, WITH THE WALK TAKEN OUT OF IT. Dropping a file in the folder
 * stays the whole install, and these two routes write that same file: the JSON is read by the same
 * reader, and it lands under the name the theme gives itself (`<id>.json`) so importing it again is
 * an update rather than a second copy — which is what makes "overwrite" a question worth asking.
 * Importing over an id another file already claims is refused (409 `theme_exists`) unless the
 * request says `overwrite`, in which case that file is the one replaced, whatever it is called: the
 * reader would otherwise have to drop one of the two claimants and the operator would be left
 * guessing which. Both routes are the admin's, for the reason the plugin directory's imports are —
 * every browser that signs in on this machine is painted by these files, and the server reads them
 * from its own data root. Neither route is needed to use the directory, though: a hand-placed file
 * is still read exactly the same way.
 *
 * WHY A DIRECTORY AND NOT A PLUGIN. A theme is values for the UI package's token contract, nothing
 * else (core's internal/external-theme.ts), so installing one needs no code to run, no build and
 * no trust: dropping a JSON file in a folder is the whole install, and the same file can travel as
 * a plugin's payload later. The folder is the data root's `themes/`, beside the installation's own
 * things — replacing the app (`penguin update`) replaces `bin lib web node` and leaves it alone.
 *
 * WHY THE STYLESHEET IS PUBLIC. The web app links it from `<head>` (packages/web/index.html), and
 * the sign-in page is a page like any other: a reader who imported a theme should see it before
 * they log in. It discloses the theme ids and colours of this installation to whoever can already
 * reach its port, which is the machine's own owner. The JSON list stays behind the login, because
 * it is the app's data rather than its paint.
 *
 * NOTHING IS CACHED. A request reads the directory, so a theme added, edited or deleted shows up
 * on the next page load of the machine that owns the folder — no restart, no cache to bust. A file
 * that does not read is reported in the JSON list and skipped in the sheet rather than failing the
 * response: one broken theme must not take the other one down, and whoever wrote it gets the
 * reason.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import type { Context } from "hono";
import { externalThemesCss, MAX_THEME_FILE_BYTES, readExternalTheme } from "@adelie/core";
import type { ExternalTheme } from "@adelie/core";
import { Bind, Component, Use } from "@adelie/core/kernel";
import type { AppEnv } from "../../auth/middleware.js";
import type { ImportedThemesResponse, ThemeImportResponse } from "../../api/types.js";
import { Config } from "../../hmr/capabilities.js";
import { HttpError } from "../errors.js";
import { badRequest, optionalBoolean, readJson, requireString } from "../validate.js";
import { fetchThemeFile, themeTooLarge } from "../../services/theme-download.js";

/** Where an installation's themes live, under the data root. */
export const THEMES_DIR = "themes";

/** One theme that read, with the file it came from. */
export interface ReadTheme {
  readonly file: string;
  readonly theme: ExternalTheme;
}

export interface ReadThemes {
  /** The directory that was read, whether or not it exists — the page shows it to the reader. */
  readonly dir: string;
  readonly themes: readonly ReadTheme[];
  readonly rejected: ReadonlyArray<{ file: string; errors: readonly string[] }>;
}

/**
 * Reads every `*.json` in the themes directory. Files are visited in name order so two requests
 * agree about which of two files owns an id, and a directory that does not exist is not an error —
 * a fresh installation has none.
 */
export async function readImportedThemes(root: string): Promise<ReadThemes> {
  const dir = join(root, THEMES_DIR);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return { dir, themes: [], rejected: [] };
  }
  const themes: ReadTheme[] = [];
  const rejected: Array<{ file: string; errors: readonly string[] }> = [];
  for (const file of names) {
    let text: string;
    try {
      text = await readFile(join(dir, file), "utf8");
    } catch (error) {
      rejected.push({ file, errors: [`读不了这个文件：${(error as Error).message}`] });
      continue;
    }
    if (text.length > MAX_THEME_FILE_BYTES) {
      rejected.push({ file, errors: [`文件超过 ${MAX_THEME_FILE_BYTES} 字节`] });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      rejected.push({ file, errors: [`不是合法的 JSON：${(error as Error).message}`] });
      continue;
    }
    const read = readExternalTheme(parsed);
    if (!read.ok) {
      rejected.push({ file, errors: read.errors });
      continue;
    }
    // A theme whose id another file already claimed is refused rather than silently dropped: the
    // person who wrote it should see that their file is the one not painting.
    //
    // An id a shipped theme owns is deliberately NOT refused here — the server does not carry the
    // list of shipped ids (they are the UI package's). Such a file is inert instead: its rules are
    // scoped to its own `data-theme`, which the app never writes for a shipped id.
    if (themes.some((entry) => entry.theme.id === read.theme.id)) {
      rejected.push({ file, errors: [`主题名「${read.theme.id}」已被另一个文件用了`] });
      continue;
    }
    themes.push({ file, theme: read.theme });
  }
  return { dir, themes, rejected };
}

export function themeStylesheetRoutes(deps: { root: string }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/", async (c) => {
    const { themes } = await readImportedThemes(deps.root);
    return c.body(externalThemesCss(themes.map((entry) => entry.theme)), 200, {
      "Content-Type": "text/css; charset=utf-8",
      // Derived from files: revalidate per load, so editing a file and reloading the page is the
      // whole edit-test loop.
      "Cache-Control": "no-cache",
    });
  });
  return routes;
}

/**
 * The guard on the two import routes. They write into the installation's data root, and every
 * browser that signs in on this machine is painted by what is in there, so the capability is the
 * admin's — the way installing to a machine is — and not a Project owner's. The reads stay open:
 * the appearance page's list is every user's screen.
 */
function requireAdmin(c: Context<AppEnv>): void {
  if (!c.var.user.isAdmin) {
    throw new HttpError(403, "admin_required", "Only an admin can import themes.");
  }
}

/**
 * The bytes of a theme file as text. UTF-8 is the only encoding the reader has, and a body that is
 * not that is a file nobody meant to write rather than one to be quietly mangled into replacement
 * characters (which a lenient decode would do, and JSON would then accept). A leading BOM is
 * dropped because an editor that writes one is common and the JSON parser would refuse it.
 */
function readThemeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new HttpError(400, "theme_invalid", "The file is not UTF-8 text.");
  }
}

/** Reads a theme file's text, or refuses it with every reason the reader collected. */
export function readThemeTextAsTheme(text: string): ExternalTheme {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new HttpError(400, "theme_invalid", `不是合法的 JSON：${(error as Error).message}`);
  }
  const read = readExternalTheme(parsed);
  if (!read.ok) throw new HttpError(400, "theme_invalid", read.errors.join("；"));
  return read.theme;
}

/**
 * Writes one theme file into the directory. The file is named after the theme's own id, which is
 * what makes a second import of the same theme an update: the id is the identity both the reader
 * and the appearance page's picker use, so the file name follows it rather than the operator's
 * file system.
 *
 * An id another file already claims is a 409 unless the request says `overwrite`, and then it is
 * THAT file that is replaced — deleting it first when it is called something else. The alternative
 * — writing `<id>.json` beside it — would leave two files claiming one id, of which the reader
 * serves only the earlier one, so the import would look successful and paint nothing.
 *
 * The text is written exactly as it arrived: this is the operator's file, and the directory is the
 * source of truth whether the file was dropped there or imported.
 */
export async function installTheme(
  root: string,
  text: string,
  overwrite: boolean,
): Promise<ReadTheme> {
  const theme = readThemeTextAsTheme(text);
  const file = `${theme.id}.json`;
  const claimed = (await readImportedThemes(root)).themes.find(
    (entry) => entry.theme.id === theme.id,
  )?.file;
  if (claimed !== undefined && !overwrite) {
    throw new HttpError(
      409,
      "theme_exists",
      `A theme named ${theme.id} is already imported as ${claimed}.`,
    );
  }
  const dir = join(root, THEMES_DIR);
  await mkdir(dir, { recursive: true });
  if (claimed !== undefined && claimed !== file) await rm(join(dir, claimed));
  await writeFile(join(dir, file), text, "utf8");
  return { file, theme };
}

export function themesRoutes(deps: { root: string }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/", async (c) => {
    const { dir, themes, rejected } = await readImportedThemes(deps.root);
    return c.json({
      dir,
      themes: themes.map(({ file, theme }) => ({ file, theme })),
      rejected: rejected.map(({ file, errors }) => ({ file, errors: [...errors] })),
    } satisfies ImportedThemesResponse);
  });

  // Install one theme from a file the operator picked (admin). The body carries the file base64 —
  // the shape the plugin, skill and hook imports all take — so the request stays JSON throughout
  // and needs no multipart handling. The cap is the format's own, checked on the DECODED bytes:
  // the encoded length is a different number, and saying "too large" about the wrong one would be
  // a refusal the operator cannot reproduce anywhere else.
  routes.post("/upload", async (c) => {
    requireAdmin(c);
    const body = await readJson(c);
    const dataBase64 = requireString(body, "dataBase64", { minLen: 1, label: "dataBase64" });
    const bytes = Buffer.from(dataBase64, "base64");
    if (bytes.byteLength === 0) throw badRequest("The file is empty.");
    if (bytes.byteLength > MAX_THEME_FILE_BYTES) throw themeTooLarge();
    const { file, theme } = await installTheme(
      deps.root,
      readThemeText(bytes),
      optionalBoolean(body, "overwrite") ?? false,
    );
    return c.json({ file, theme } satisfies ThemeImportResponse, 201);
  });

  // Install one theme from an address (admin): the server fetches it, because the server is what
  // can reach it, and the bytes are then read by the same reader the upload path uses — one
  // judging of what a theme file is, whichever way it arrived.
  routes.post("/download", async (c) => {
    requireAdmin(c);
    const body = await readJson(c);
    const url = requireString(body, "url", { minLen: 1, maxLen: 2048 });
    const bytes = await fetchThemeFile(url);
    if (bytes.byteLength === 0) throw badRequest("The download is empty.");
    const { file, theme } = await installTheme(
      deps.root,
      readThemeText(bytes),
      optionalBoolean(body, "overwrite") ?? false,
    );
    return c.json({ file, theme } satisfies ThemeImportResponse, 201);
  });

  return routes;
}

/** The appearance page's list: what this installation imported, and what would not read. */
@Component({
  contributes: {
    "HttpModule.routes": [
      { id: "ThemesRoutes.routes", prefix: "/api/themes", auth: "user", order: 66 },
    ],
  },
})
export class ThemesRoutes {
  @Use() private readonly config!: Config;
  @Bind("ThemesRoutes.routes") routes!: Hono<AppEnv>;
  setup() {
    this.routes = themesRoutes({ root: this.config.root });
  }
}

/** The stylesheet the app links from `<head>`, before anyone has logged in. */
@Component({
  contributes: {
    "HttpModule.routes": [
      { id: "ThemeStylesheetRoutes.routes", prefix: "/api/themes.css", auth: "none", order: 5 },
    ],
  },
})
export class ThemeStylesheetRoutes {
  @Use() private readonly config!: Config;
  @Bind("ThemeStylesheetRoutes.routes") routes!: Hono<AppEnv>;
  setup() {
    this.routes = themeStylesheetRoutes({ root: this.config.root });
  }
}
