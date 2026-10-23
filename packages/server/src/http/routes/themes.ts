/**
 * Imported themes: what an installation put in `<data root>/themes/`.
 *
 *   GET /api/themes         the list, for the appearance page (auth: user)
 *   GET /api/themes.css     the same files as one stylesheet (auth: none)
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
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { externalThemesCss, readExternalTheme } from "@adelie/core";
import type { ExternalTheme } from "@adelie/core";
import { Bind, Component, Use } from "@adelie/core/kernel";
import type { AppEnv } from "../../auth/middleware.js";
import type { ImportedThemesResponse } from "../../api/types.js";
import { Config } from "../../hmr/capabilities.js";

/** Where an installation's themes live, under the data root. */
export const THEMES_DIR = "themes";

/** A body-bounded reader: a theme file is values, and values are small. */
const MAX_FILE_BYTES = 256 * 1024;

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
    if (text.length > MAX_FILE_BYTES) {
      rejected.push({ file, errors: [`文件超过 ${MAX_FILE_BYTES} 字节`] });
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
  return routes;
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
