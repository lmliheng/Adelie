/**
 * A remote theme REGISTRY: one address that serves an index of themes, and the theme files it
 * names.
 *
 * The install path is unchanged — fetch the theme file, read it with core's `readExternalTheme`,
 * write `<id>.json` into `<data root>/themes/` (http/routes/themes.ts). What a registry adds is that
 * the reader no longer has to be handed an address per theme: it names what exists, and the address
 * of each file is that name joined onto the registry's own base. So this module is three things and
 * no fourth: the base address (a default, overridable), the index read (bounded, checked by core,
 * cached), and one theme file's bytes (the download route's own `fetchThemeFile`, reused rather than
 * re-implemented, so a registry file is judged by the same guards and the same cap as a typed URL).
 *
 * WHY THE INDEX IS CACHED AND ITS THEMES ARE NOT. The index is a catalogue that two clicks may ask
 * for twice, and it changes when its author publishes — five minutes of staleness costs nothing,
 * while every page load hitting the network would make this machine's appearance page depend on
 * somebody else's uptime. An import, on the other hand, is a deliberate act and reads the file it is
 * about right then; caching that would be caching a version the operator did not ask for. A failed
 * index read is remembered for much less time (30s) — long enough that a page that renders once
 * does not retry on every card, short enough that a network blip does not hide the catalogue for
 * five minutes.
 *
 * WHY THE DEFAULT IS AN npm MIRROR AND NOT A RAW GITHUB URL. The registry is published both as a
 * GitHub repository and as an npm package, and the files are identical; the package is what has a
 * stable, versioned address, and npmmirror is the copy that answers inside mainland China, which is
 * where this installation runs. jsDelivr's GitHub copy is the second address because the npm mirror
 * lags a fresh release by up to an hour, and a catalogue that exists but cannot be read yet is the
 * one failure a second address fixes for free. `ADELIE_THEME_REGISTRY` replaces the whole list with
 * one address — a mirror, a fork, or a directory someone serves on their own machine — because the
 * format, not the host, is what this module knows.
 */
import { MAX_REGISTRY_FILE_BYTES, readThemeRegistry, resolveRegistryFile } from "@adelie/core";
import type { RegistryThemeEntry, ThemeRegistry } from "@adelie/core";
import { HttpError } from "../http/errors.js";
import { fetchThemeFile } from "./theme-download.js";

/**
 * Where the catalogue this app ships against lives: the npm package's files, served by npmmirror's
 * file proxy, with jsDelivr's GitHub copy behind it.
 *
 * Two addresses and not one because the same bytes travel two ways and the two fail differently.
 * npmmirror answers fast inside mainland China and lags a fresh npm release by minutes to an hour
 * (a package it has not synced yet is a 404), while jsDelivr serves the repository's files straight
 * from GitHub and knows a new commit at once — the reverse trade, and slower or unreachable in some
 * networks. The client tries them in this order and keeps whichever answered (see
 * {@link createThemeRegistry}), so a release is visible on one of them immediately and the other
 * becomes the one that works where the first does not.
 */
export const DEFAULT_THEME_REGISTRY_BASES: readonly string[] = [
  "https://registry.npmmirror.com/@lmliheng/adelie-themes/latest/files/",
  "https://cdn.jsdelivr.net/gh/lmliheng/adelie-themes@main/",
];

/** The first of the defaults — what "the address" means when someone asks for one. */
export const DEFAULT_THEME_REGISTRY_BASE = DEFAULT_THEME_REGISTRY_BASES[0]!;

/** The environment variable that replaces the base (a mirror, a fork, a LAN copy). */
export const THEME_REGISTRY_ENV = "ADELIE_THEME_REGISTRY";

/** The index's own file name, under the base address. */
export const THEME_REGISTRY_INDEX = "index.json";

/** How long a read index is reused. */
const INDEX_TTL_MS = 5 * 60_000;

/** How long a failed read is remembered — a page load's worth of clicks, not five minutes of them. */
const INDEX_FAILURE_TTL_MS = 30_000;

/**
 * The addresses to read from, in order: `ADELIE_THEME_REGISTRY` when it is set (one address, alone),
 * the defaults otherwise. Null when the variable is set to something that is not an http(s)
 * address — the caller reports that instead of quietly falling back, because an operator who set it
 * meant it, and a silent fallback would show a catalogue from a host they did not choose.
 */
export function registryBases(env: NodeJS.ProcessEnv = process.env): readonly string[] | null {
  const raw = env[THEME_REGISTRY_ENV]?.trim();
  if (!raw) return DEFAULT_THEME_REGISTRY_BASES;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return [url.toString()];
}

/** The first address to read from — the one worth naming when a page shows a single one. */
export function registryBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return registryBases(env)?.[0] ?? null;
}

/** One read of the index, success or the reason it is not. */
export type ThemeRegistryLoad =
  | {
      readonly ok: true;
      readonly registry: ThemeRegistry;
      /** The address that answered — the one an entry's file is then fetched from. */
      readonly base: string;
      /** When these bytes were fetched (ms since epoch) — a cached answer keeps its own time. */
      readonly fetchedAt: number;
    }
  | {
      readonly ok: false;
      readonly error: { readonly code: string; readonly message: string };
    };

export interface ThemeRegistryClient {
  /** The addresses this client reads from, in the order it tries them. */
  readonly bases: readonly string[];
  /** The catalogue, from the cache when it is warm, else over the network. Never throws. */
  read(): Promise<ThemeRegistryLoad>;
  /** One entry's file, from the address that answered, under the download route's own guards. */
  fetchEntryBytes(entry: RegistryThemeEntry, base: string): Promise<Buffer>;
}

export interface ThemeRegistryOptions {
  /** One address, alone. Defaults to `registryBases()` — the environment's, not a hardcoded one. */
  base?: string | null;
  /** The addresses, in order. Takes precedence over `base`; the tests use one. */
  bases?: readonly string[];
  ttlMs?: number;
  failureTtlMs?: number;
  now?: () => number;
  /** The tests' seam, as the download service's own: answer with a file, no network. */
  fetchImpl?: typeof fetch;
}

/**
 * One client per app: it owns the cache, so a warm index is shared by every request that asks and
 * two simultaneous reads share one fetch rather than racing. A new app (a test, a restart) starts
 * cold, which is what makes a directory edit visible on the next boot.
 */
export function createThemeRegistry(options: ThemeRegistryOptions = {}): ThemeRegistryClient {
  // One address when it was configured (or handed in by a test), the default list otherwise. `null`
  // is "configured but unusable", which is an error rather than a reason to try the defaults.
  const configured: readonly string[] | null =
    options.bases ??
    (options.base === undefined ? registryBases() : options.base === null ? null : [options.base]);
  const bases = configured ?? [];
  const ttl = options.ttlMs ?? INDEX_TTL_MS;
  const failureTtl = options.failureTtlMs ?? INDEX_FAILURE_TTL_MS;
  const now = options.now ?? Date.now;
  let cached: { readonly load: ThemeRegistryLoad; readonly at: number } | null = null;
  let inflight: Promise<ThemeRegistryLoad> | null = null;

  /** One address's answer: a transport failure is worth asking elsewhere, a bad catalogue is not. */
  type Attempt =
    | { readonly ok: true; readonly load: ThemeRegistryLoad }
    | {
        readonly ok: false;
        readonly retry: boolean;
        readonly error: { readonly code: string; readonly message: string };
      };

  async function readFrom(base: string): Promise<Attempt> {
    const indexUrl = resolveRegistryFile(base, THEME_REGISTRY_INDEX);
    if (indexUrl === null) {
      return {
        ok: false,
        retry: true,
        error: { code: "registry_unusable", message: `主题库地址拼不出目录：${base}` },
      };
    }
    let bytes: Buffer;
    try {
      bytes = await fetchThemeFile(indexUrl, {
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        maxBytes: MAX_REGISTRY_FILE_BYTES,
      });
    } catch (err) {
      const error = err instanceof HttpError ? err : null;
      return {
        ok: false,
        retry: true,
        error: {
          code: "registry_unavailable",
          message: error ? error.message : `读不到主题库目录：${message(err)}`,
        },
      };
    }
    let parsed: unknown;
    try {
      // Fatal decoding: a catalogue that is not UTF-8 is a file nobody meant to publish, and the
      // JSON parser behind a lenient decode would only say so about a different file.
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
      parsed = JSON.parse(text);
    } catch (err) {
      return {
        ok: false,
        retry: false,
        error: { code: "registry_invalid", message: `主题库目录读不出来：${message(err)}` },
      };
    }
    const read = readThemeRegistry(parsed);
    if (!read.ok) {
      // This host answered and its answer is a broken catalogue: the other address serves the SAME
      // file, so asking it would only spend the timeout to be told the same thing.
      return {
        ok: false,
        retry: false,
        error: { code: "registry_invalid", message: read.errors.join("；") },
      };
    }
    return {
      ok: true,
      load: { ok: true, registry: read.registry, base, fetchedAt: now() },
    };
  }

  async function loadIndex(): Promise<ThemeRegistryLoad> {
    if (configured === null) {
      return {
        ok: false,
        error: {
          code: "registry_unusable",
          message: `${THEME_REGISTRY_ENV} 不是一个 http(s) 地址。`,
        },
      };
    }
    let last: { readonly code: string; readonly message: string } | null = null;
    for (const base of bases) {
      const attempt = await readFrom(base);
      if (attempt.ok) return attempt.load;
      last = attempt.error;
      if (!attempt.retry) break;
    }
    return {
      ok: false,
      error: last ?? {
        code: "registry_unusable",
        message: "没有可用的主题库地址。",
      },
    };
  }

  return {
    bases,
    async read() {
      const at = now();
      if (cached !== null && at - cached.at < (cached.load.ok ? ttl : failureTtl)) {
        return cached.load;
      }
      if (inflight !== null) return inflight;
      inflight = loadIndex()
        .then((load) => {
          cached = { load, at: now() };
          return load;
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
    async fetchEntryBytes(entry: RegistryThemeEntry, base: string) {
      const url = resolveRegistryFile(base, entry.file);
      if (url === null) {
        // Unreachable through the route (the index's reader only hands back paths this accepts), and
        // refused anyway rather than fetching an address an entry invented.
        throw new HttpError(
          400,
          "registry_invalid",
          `主题「${entry.id}」的路径不是仓库内的相对路径：${entry.file}`,
        );
      }
      return fetchThemeFile(url, options.fetchImpl ? { fetchImpl: options.fetchImpl } : {});
    },
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
