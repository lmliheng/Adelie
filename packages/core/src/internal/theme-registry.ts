/**
 * A theme REGISTRY: the index a shared theme repository publishes, so an installation can browse
 * what exists instead of being handed a URL.
 *
 * The directory an installation keeps (`<data root>/themes/`) is still the whole install — a
 * registry changes only where the FILE comes from: an index names the themes, each entry points at
 * one file in the same repository, and the install path (fetch, read, write `<id>.json`) is the one
 * the download import already used. So the index is a catalogue, never a second format: the theme
 * file it points at is read by `readExternalTheme`, with the same caps and the same refusal list.
 *
 * WHY THE INDEX IS CHECKED HERE AND NOT BY EACH CLIENT. Two readers exist — the server that fetches
 * it and the page that draws the cards — and a catalogue half-understood by one of them is a theme
 * that appears and then fails to import. It lives in core for the same reason the theme format
 * does: both ends already depend on core, and neither may depend on the other.
 *
 * WHAT A FILE PATH MAY BE. Repository-relative and plain: the registry is one host serving its own
 * files, so `file` is joined onto the registry's base address and nothing else. An entry that asks
 * for an absolute URL, a scheme, or a `..` hop is refused here, not at fetch time — the point of an
 * index is that one host answers for all of it, and an index that can send a reader anywhere is an
 * open redirect with extra steps.
 */

/** The index shape this module reads. A later shape bumps it rather than half-reading an old one. */
export const THEME_REGISTRY_SCHEMA_VERSION = 1;

/** How big a registry index may be — a list of names, not a payload. */
export const MAX_REGISTRY_FILE_BYTES = 128 * 1024;

/** The most themes one index may offer. */
const MAX_REGISTRY_THEMES = 200;

/** Display copy is copy: bounded, not patterned. */
const NAME = /^[\s\S]{1,60}$/;
const AUTHOR = /^[\s\S]{1,60}$/;
const DESCRIPTION = /^[\s\S]{1,280}$/;
const VERSION = /^[0-9A-Za-z.+-]{1,32}$/;

/**
 * A repository-relative path: segments of plain characters, never `.`/`..`, never an absolute URL
 * and never a backslash (which Windows would read as a separator while this module would not).
 */
const FILE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

/** The four colours a card paints, and the only swatch names this format knows. */
export const SWATCH_NAMES = ["--ui-canvas", "--ui-surface", "--ui-fg", "--ui-accent"] as const;

/** A token value's safety is the theme format's rule, reused rather than restated. */
const SAFE_VALUE = /^[^;{}<>\\@\n\r]{1,120}$/;
const FETCHES = /url\s*\(|image-set\s*\(|expression\s*\(/i;

export interface RegistrySwatch {
  /** The four colours above, as the theme paints them in this mode. */
  readonly light?: Readonly<Record<string, string>>;
  readonly dark?: Readonly<Record<string, string>>;
}

/** One theme the registry offers. */
export interface RegistryThemeEntry {
  readonly id: string;
  readonly name: string;
  readonly nameZh?: string;
  readonly author: string;
  readonly description?: string;
  readonly descriptionZh?: string;
  /** Repository-relative path of the theme file. */
  readonly file: string;
  /** The theme file's own version, for cards that show one. */
  readonly version?: string;
  readonly swatch?: RegistrySwatch;
}

export interface ThemeRegistry {
  readonly schemaVersion: number;
  /** The registry's own name, shown above its list. */
  readonly name?: string;
  readonly updatedAt?: string;
  readonly themes: readonly RegistryThemeEntry[];
}

export type ThemeRegistryRead =
  | { readonly ok: true; readonly registry: ThemeRegistry }
  | { readonly ok: false; readonly errors: readonly string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The four-name swatch: undefined when the entry carries none, null when it carries one this
 * format does not understand. A swatch that fails fails its whole entry rather than being
 * half-drawn — a card's colours are the only reason the index carries them.
 */
function readSwatch(
  value: unknown,
  where: string,
  errors: string[],
): RegistrySwatch | null | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    errors.push(`${where}: 要是一个对象（light / dark）`);
    return null;
  }
  const out: { light?: Record<string, string>; dark?: Record<string, string> } = {};
  for (const mode of ["light", "dark"] as const) {
    const tokens = value[mode];
    if (tokens === undefined) continue;
    if (!isPlainObject(tokens)) {
      errors.push(`${where}.${mode}: 要是一个对象`);
      return null;
    }
    const colours: Record<string, string> = {};
    for (const [name, raw] of Object.entries(tokens)) {
      if (!(SWATCH_NAMES as readonly string[]).includes(name)) {
        errors.push(
          `${where}.${mode}: 「${name}」不是色板里的名字（只能是 ${SWATCH_NAMES.join(" / ")}）`,
        );
        return null;
      }
      if (typeof raw !== "string" || !SAFE_VALUE.test(raw) || FETCHES.test(raw)) {
        errors.push(`${where}.${mode}: 「${name}」的值不能用`);
        return null;
      }
      colours[name] = raw;
    }
    if (Object.keys(colours).length > 0) out[mode] = colours;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/** One entry, or the reasons it is not one. */
function readEntry(
  entry: unknown,
  where: string,
  seen: Set<string>,
): { ok: true; entry: RegistryThemeEntry } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isPlainObject(entry)) return { ok: false, errors: [`${where}: 要是一个对象`] };
  const id = entry.id;
  if (typeof id !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(id))
    return { ok: false, errors: [`${where}.id: 「${String(id)}」不是合法的主题名`] };
  if (seen.has(id)) return { ok: false, errors: [`${where}.id: 「${id}」出现了两次`] };
  const name = entry.name;
  if (typeof name !== "string" || !NAME.test(name))
    return { ok: false, errors: [`${where}.name: 要有 1–60 个字的显示名`] };
  const author = entry.author;
  if (typeof author !== "string" || !AUTHOR.test(author))
    return { ok: false, errors: [`${where}.author: 要有 1–60 个字的作者名`] };
  const file = entry.file;
  if (typeof file !== "string" || !FILE_PATH.test(file))
    return { ok: false, errors: [`${where}.file: 「${String(file)}」不是仓库内的相对路径`] };
  const nameZh = entry.nameZh;
  if (nameZh !== undefined && (typeof nameZh !== "string" || !NAME.test(nameZh)))
    return { ok: false, errors: [`${where}.nameZh: 要有 1–60 个字（不写就用 name）`] };
  const description = entry.description;
  if (
    description !== undefined &&
    (typeof description !== "string" || !DESCRIPTION.test(description))
  )
    return { ok: false, errors: [`${where}.description: 要有 1–280 个字`] };
  const descriptionZh = entry.descriptionZh;
  if (
    descriptionZh !== undefined &&
    (typeof descriptionZh !== "string" || !DESCRIPTION.test(descriptionZh))
  )
    return { ok: false, errors: [`${where}.descriptionZh: 要有 1–280 个字`] };
  const version = entry.version;
  if (version !== undefined && (typeof version !== "string" || !VERSION.test(version)))
    return { ok: false, errors: [`${where}.version: 「${String(version)}」不像一个版本号`] };
  const swatch = readSwatch(entry.swatch, `${where}.swatch`, errors);
  if (swatch === null || errors.length > 0) return { ok: false, errors };
  seen.add(id);
  return {
    ok: true,
    entry: {
      id,
      name,
      ...(nameZh === undefined ? {} : { nameZh }),
      author,
      ...(description === undefined ? {} : { description }),
      ...(descriptionZh === undefined ? {} : { descriptionZh }),
      file,
      ...(version === undefined ? {} : { version }),
      ...(swatch === undefined ? {} : { swatch }),
    },
  };
}

/**
 * Reads one index. Errors are collected rather than thrown on the first one: a registry author
 * gets the whole list, and an entry that fails is dropped — one broken line must not hide the rest
 * of the catalogue.
 */
export function readThemeRegistry(value: unknown): ThemeRegistryRead {
  if (!isPlainObject(value)) return { ok: false, errors: ["顶层必须是一个对象"] };
  const errors: string[] = [];
  const schema = value.schemaVersion;
  if (schema !== undefined && schema !== THEME_REGISTRY_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion: ${String(schema)} 不是本版本认识的 ${THEME_REGISTRY_SCHEMA_VERSION}`,
    );
  }
  const raw = value.themes;
  if (!Array.isArray(raw)) return { ok: false, errors: [...errors, "themes: 要是一个数组"] };
  if (raw.length > MAX_REGISTRY_THEMES) {
    errors.push(`themes: ${raw.length} 条，超过上限 ${MAX_REGISTRY_THEMES}`);
  }
  const themes: RegistryThemeEntry[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.slice(0, MAX_REGISTRY_THEMES).entries()) {
    const read = readEntry(entry, `themes[${index}]`, seen);
    if (!read.ok) {
      errors.push(...read.errors);
      continue;
    }
    themes.push(read.entry);
  }
  const registry: ThemeRegistry = {
    schemaVersion: THEME_REGISTRY_SCHEMA_VERSION,
    ...(typeof value.name === "string" && NAME.test(value.name) ? { name: value.name } : {}),
    ...(typeof value.updatedAt === "string" && VERSION.test(value.updatedAt)
      ? { updatedAt: value.updatedAt }
      : {}),
    themes,
  };
  if (themes.length === 0 && errors.length === 0) errors.push("themes: 一条都没有");
  // All or nothing: a catalogue that silently lacks the entry its author just added reads as a
  // registry problem that nobody can locate. The whole list of reasons is the useful answer.
  return errors.length > 0 ? { ok: false, errors } : { ok: true, registry };
}

/**
 * One entry's address: the registry's base, its trailing slash normalised, plus the entry's own
 * relative path. Null when the base is not http(s) or the path is not one this format accepts —
 * the same rule as the reader's, so nothing that passed the index can fail here.
 */
export function resolveRegistryFile(base: string, file: string): string | null {
  if (!/^https?:\/\//i.test(base)) return null;
  if (!FILE_PATH.test(file)) return null;
  return `${base.replace(/\/+$/, "")}/${file}`;
}
