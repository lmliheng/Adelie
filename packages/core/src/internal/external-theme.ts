/**
 * Themes an installation imported, rather than the three the UI package ships.
 *
 * A theme is nothing but VALUES for the token contract (`@adelie/ui`'s tokens.ts) — every
 * component reads those names and none of them asks which theme is active, so a theme that
 * arrives as data repaints the whole app with no rebuild and no component knowing. What a shipped
 * theme declares in `themes/<id>.css` an imported one declares in a JSON file, and this module
 * turns that file into the CSS the browser would otherwise have been built with:
 *
 *     :root[data-theme="warm-paper"] { --ui-canvas: … }   ← the theme's light values
 *     :root[data-theme="warm-paper"].dark { … }           ← only what dark changes
 *
 * It lives in core, not in the UI package, because BOTH ends need it and they may not import each
 * other: the server reads the files and serves the stylesheet (it has no React and must not gain
 * one), and the app reads the same files back as data. The token NAMES are the UI package's —
 * they are a contract about components — so what is checked here is the shape and the safety of a
 * value, never whether a name exists; the app adds that judgement where the contract lives.
 *
 * THE BASE RULE REACHES BOTH MODES (`:root[data-theme="x"], :root[data-theme="x"].dark`) so the
 * cascade needs no promise about which sheet came first: a name the theme declares and dark does
 * not change keeps the theme's value in dark mode, exactly as a shipped theme's base rule beats
 * Primer's `.dark` rule. Everything the theme leaves out falls through to the default theme, whose
 * base rule is the bare `:root` — which is why a half-filled theme warns rather than fails: it
 * paints, it is just more Primer than its author meant.
 *
 * THE LAYERS ARE NAMED (`@layer ui-theme`, `@layer ui-accent`) for the same reason: an unlayered
 * rule beats every layered one, so an imported theme that declared `--ui-font-sans` unlayered
 * would override the user's own font pairing, which lives in `ui-font`, last of the three.
 *
 * A VALUE IS A VALUE. Nothing here is echoed into the sheet without passing {@link SAFE_VALUE},
 * which refuses the characters that would let an imported file leave its declaration — `;`, `{`,
 * `}`, `\`, `<`, a newline, `@` — and the two functions that fetch something (`url(`,
 * `image-set(`). An imported theme is therefore confined to the token names: it cannot add rules,
 * hide an element or call home. That is the whole trade — no new components, no new layout, one
 * set of values per mode.
 */

/** The file shape this module reads. A later shape bumps it rather than half-reading an old file. */
export const EXTERNAL_THEME_SCHEMA_VERSION = 1;

/**
 * The id space of a theme, open: an installation imports themes besides the three the UI package
 * ships, and one pattern covers both — the shipped ids are just short ones. The UI package carries
 * the same pattern for the pre-paint script (`@adelie/ui`'s THEME_ID_PATTERN), and a test in the
 * web app holds the two equal.
 */
export const THEME_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

/** Whether a stored theme or accent id is one the app may put in a `data-*` attribute. */
export function isThemeId(value: unknown): value is string {
  return typeof value === "string" && THEME_ID_PATTERN.test(value);
}

/** The user-facing names are copy, so they are only bounded — not patterns. */
const NAME = /^[\s\S]{1,60}$/;

/**
 * What a declared value may look like. Length-bounded, one line, and free of the characters that
 * end a declaration, open a block, escape, or — with `url(`/`image-set(` — fetch something.
 */
const SAFE_VALUE = /^[^;{}<>\\@\n\r]{1,120}$/;
const FETCHES = /url\s*\(|image-set\s*\(|expression\s*\(/i;

/** A cap that keeps a runaway file from becoming a megabyte of stylesheet on every page load. */
const MAX_TOKENS = 400;
const MAX_ACCENTS = 12;

/**
 * How big a theme file may be. It lives here, with the format's other caps, because three places
 * have to agree on one number: the reader that refuses an oversized file it finds in the directory,
 * and the two import routes (an upload's bytes, a download's response) that must not write a file
 * the reader would then refuse. The format is values — a few hundred token names and their colours
 * — so the room is generous for what it holds and still nowhere near a megabyte.
 */
export const MAX_THEME_FILE_BYTES = 256 * 1024;

/** One accent preset an imported theme lists, shaped like the shipped themes' own. */
export interface ExternalThemeAccent {
  readonly id: string;
  /** The `--ui-accent` (and anything else the author wants) for light mode. */
  readonly light: Readonly<Record<string, string>>;
  /** Only what dark changes; absent means the light values hold in both modes. */
  readonly dark?: Readonly<Record<string, string>>;
}

/** A theme file, read and validated. */
export interface ExternalTheme {
  readonly id: string;
  /** Its name in the interface. `nameZh` is what a Chinese UI shows; absent falls back to `name`. */
  readonly name: string;
  readonly nameZh?: string;
  /** Every token the theme sets for light — the base both modes start from. */
  readonly light: Readonly<Record<string, string>>;
  readonly dark?: Readonly<Record<string, string>>;
  readonly accents?: readonly ExternalThemeAccent[];
}

export type ExternalThemeRead =
  | { readonly ok: true; readonly theme: ExternalTheme }
  | { readonly ok: false; readonly errors: readonly string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One token map: `--ui-*` names only, values as above, within {@link MAX_TOKENS}. */
function readTokens(
  value: unknown,
  where: string,
  errors: string[],
): Record<string, string> | null {
  if (!isPlainObject(value)) {
    errors.push(`${where}: 必须是一个对象（名字 → 值）`);
    return null;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    errors.push(`${where}: 一个名字都没有`);
    return null;
  }
  if (entries.length > MAX_TOKENS) {
    errors.push(`${where}: ${entries.length} 个名字，超过上限 ${MAX_TOKENS}`);
    return null;
  }
  const out: Record<string, string> = {};
  for (const [name, raw] of entries) {
    if (!/^--[a-z0-9-]+$/.test(name)) {
      errors.push(`${where}: 「${name}」不是合法的令牌名（要 --小写-连字符）`);
      continue;
    }
    if (typeof raw !== "string" || !SAFE_VALUE.test(raw) || FETCHES.test(raw)) {
      errors.push(`${where}: 「${name}」的值不能用（不能有 ; { } < \\ @ 换行，也不能 url(）`);
      continue;
    }
    out[name] = raw;
  }
  return Object.keys(out).length === 0 ? null : out;
}

function readAccents(value: unknown, errors: string[]): readonly ExternalThemeAccent[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    errors.push("accents: 要是一个数组");
    return undefined;
  }
  if (value.length > MAX_ACCENTS) {
    errors.push(`accents: ${value.length} 个预设，超过上限 ${MAX_ACCENTS}`);
    return undefined;
  }
  const out: ExternalThemeAccent[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const where = `accents[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${where}: 要是一个对象`);
      continue;
    }
    const id = entry.id;
    // `neutral` is the absence of a preset, so it can never be one.
    if (typeof id !== "string" || !THEME_ID_PATTERN.test(id) || id === "neutral") {
      errors.push(
        `${where}.id: 「${String(id)}」不是合法的预设名（要小写连字符，且不能叫 neutral）`,
      );
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${where}.id: 「${id}」出现了两次`);
      continue;
    }
    const light = readTokens(entry.light, `${where}.light`, errors);
    if (light === null) continue;
    const dark = entry.dark === undefined ? null : readTokens(entry.dark, `${where}.dark`, errors);
    if (entry.dark !== undefined && dark === null) continue;
    seen.add(id);
    out.push({ id, light, ...(dark === null ? {} : { dark }) });
  }
  return out.length === 0 ? undefined : out;
}

/**
 * Reads a theme file. Errors are collected rather than thrown on the first one: whoever wrote the
 * file gets the whole list, and a file refused here never reaches a stylesheet. The shipped ids
 * are not refused here (this module does not know them); an imported theme can only ever paint
 * under its own `data-theme`, so a file that names a shipped theme simply never matches.
 */
export function readExternalTheme(value: unknown): ExternalThemeRead {
  if (!isPlainObject(value)) return { ok: false, errors: ["顶层必须是一个对象"] };
  const errors: string[] = [];

  const schema = value.schemaVersion;
  if (schema !== undefined && schema !== EXTERNAL_THEME_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion: ${String(schema)} 不是本版本认识的 ${EXTERNAL_THEME_SCHEMA_VERSION}`,
    );
  }
  const id = value.id;
  if (typeof id !== "string" || !THEME_ID_PATTERN.test(id)) {
    errors.push(
      `id: 「${String(id)}」不是合法的主题名（要小写字母开头、小写字母数字连字符，最长 32）`,
    );
  }
  const name = value.name;
  if (typeof name !== "string" || !NAME.test(name)) {
    errors.push("name: 要有 1–60 个字的显示名");
  }
  const nameZh = value.nameZh;
  if (nameZh !== undefined && (typeof nameZh !== "string" || !NAME.test(nameZh))) {
    errors.push("nameZh: 要有 1–60 个字（不写就用 name）");
  }
  const light = readTokens(value.light, "light", errors);
  const dark = value.dark === undefined ? null : readTokens(value.dark, "dark", errors);
  if (value.dark !== undefined && dark === null && errors.length === 0) {
    errors.push("dark: 没有可用的值");
  }
  const accents = readAccents(value.accents, errors);

  if (
    errors.length > 0 ||
    light === null ||
    typeof id !== "string" ||
    typeof name !== "string" ||
    !THEME_ID_PATTERN.test(id)
  ) {
    return { ok: false, errors: errors.length > 0 ? errors : ["文件读不出一个主题"] };
  }
  return {
    ok: true,
    theme: {
      id,
      name,
      ...(typeof nameZh === "string" ? { nameZh } : {}),
      light,
      ...(dark === null ? {} : { dark }),
      ...(accents === undefined ? {} : { accents }),
    },
  };
}

function declarations(tokens: Readonly<Record<string, string>>): string {
  return Object.entries(tokens)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

/** The two selectors a theme's base rule matches: the attribute, and itself under `.dark`. */
function roots(id: string, accent: string | null): [string, string] {
  const root =
    accent === null
      ? `:root[data-theme="${id}"]`
      : `:root[data-theme="${id}"][data-accent="${accent}"]`;
  return [root, `${root}.dark`];
}

/** One theme's rules, ready to be concatenated with the others into one stylesheet. */
export function externalThemeCss(theme: ExternalTheme): string {
  const out: string[] = [`/* ${theme.id} — ${theme.name} */`];
  const [base, baseDark] = roots(theme.id, null);
  out.push("@layer ui-theme{");
  out.push(`${base},${baseDark}{${declarations(theme.light)}}`);
  if (theme.dark !== undefined && Object.keys(theme.dark).length > 0) {
    out.push(`${baseDark}{${declarations(theme.dark)}}`);
  }
  out.push("}");
  const accents = theme.accents ?? [];
  if (accents.length > 0) {
    out.push("@layer ui-accent{");
    for (const accent of accents) {
      const [light, dark] = roots(theme.id, accent.id);
      out.push(`${light},${dark}{${declarations(accent.light)}}`);
      if (accent.dark !== undefined && Object.keys(accent.dark).length > 0) {
        out.push(`${dark}{${declarations(accent.dark)}}`);
      }
    }
    out.push("}");
  }
  return out.join("\n");
}

/** Every imported theme's rules in one stylesheet; the shipped themes are not repeated here. */
export function externalThemesCss(themes: readonly ExternalTheme[]): string {
  if (themes.length === 0) return "/* no imported themes */\n";
  return themes.map(externalThemeCss).join("\n") + "\n";
}
