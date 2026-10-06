/**
 * Plugin registries: WHERE plugin index entries come from. A registry is one source
 * of `PluginIndexEntry` rows — the shared index format every registry speaks (see
 * api/types.ts; the schema follows typst/packages' `index.json`: a flat array of
 * per-version entries). Discovery only: a Project asks for an entry on the Plugins page
 * (http/routes/plugins-installed.ts), and nothing here imports plugin code.
 *
 * Two implementations, one contract:
 *   - the builtin registry serves the index embedded in this package (builtin-index.json —
 *     the curated entries, today the four sandbox backends) plus one entry per plugin package
 *     this build ships, each read from the package itself;
 *   - the HTTP registry fetches an `index.json` URL and runs it through the same
 *     validator, so a remote index is trusted no further than the embedded one.
 *
 * The deployment's registry list is fixed to the builtin one for now; additional
 * sources plug in as more `PluginRegistry` values.
 */
import { builtinPluginDir, loadLibraryPlugins } from "@lmliheng/penguin-core";
import type { PluginIndexEntry } from "../api/types.js";
import builtinIndex from "./builtin-index.json" with { type: "json" };
import fs from "node:fs/promises";
import path from "node:path";
import { discoverBuiltinPlugins, resolvePluginPackage } from "./loader.js";
import type { PluginBase } from "./loader.js";

/** One source of plugin index entries; `source` identifies it for display and errors. */
export interface PluginRegistry {
  readonly source: string;
  index(): Promise<PluginIndexEntry[]>;
  /**
   * Long-form documentation for one entry, or null when this source has none for it.
   *
   * Separate from `index` because the shapes differ: the index is a listing sent in full
   * on every page load, a readme is large and wanted only for the entry someone opened.
   */
  readme(name: string): Promise<string | null>;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Validates one raw entry; returns null instead of throwing so the caller can name the index position. */
function asIndexEntry(value: unknown): PluginIndexEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  if (
    typeof e.name !== "string" ||
    typeof e.version !== "string" ||
    typeof e.description !== "string" ||
    !isStringArray(e.authors) ||
    typeof e.license !== "string"
  ) {
    return null;
  }
  for (const key of ["repository", "homepage"] as const) {
    if (e[key] !== undefined && typeof e[key] !== "string") return null;
  }
  for (const key of ["keywords", "categories"] as const) {
    if (e[key] !== undefined && !isStringArray(e[key])) return null;
  }
  if (e.updatedAt !== undefined && typeof e.updatedAt !== "number") return null;
  return value as PluginIndexEntry;
}

/**
 * Validates a whole index document. Strict, not per-entry-tolerant: an index is one
 * publisher's single artifact, so a malformed row means the artifact is broken —
 * unlike a Project's plugin list, whose entries are independent choices skipped one
 * by one.
 */
export function parsePluginIndex(data: unknown, source: string): PluginIndexEntry[] {
  if (!Array.isArray(data)) {
    throw new Error(`plugin index from ${source} is not an array`);
  }
  return data.map((raw, i) => {
    const entry = asIndexEntry(raw);
    if (entry === null) {
      throw new Error(`plugin index from ${source} has a malformed entry at index ${i}`);
    }
    return entry;
  });
}

export const BUILTIN_REGISTRY_SOURCE = "builtin";

/**
 * Who the entries this package publishes are attributed to: the workspace's own plugin
 * packages carry no `author` field, and the embedded index names the project itself — the
 * same identity the docs' footer carries.
 */
const PUBLISHER = "Prism Shadow";

/**
 * The scope every built-in plugin package is published under. Core names a built-in plugin by
 * its DIRECTORY, which is the dependency name it read out of the host package with this scope
 * stripped (see core's plugin roots) — so scoping the name back is how the rest of the system
 * (a Project's plugin list, an install, the market's shelf) names the same package.
 */
const PLUGIN_SCOPE = "@lmliheng/";

/**
 * The built-in library's plugin packages, by specifier: what this build carries because the
 * host package declares it — the same list the Plugins page's cards come from. Names only, and
 * nothing is read from the packages here.
 */
export function builtinLibraryNames(root: string): string[] {
  return loadLibraryPlugins(root)
    .filter((plugin) => plugin.source === "builtin")
    .map((plugin) => `${PLUGIN_SCOPE}${plugin.name}`);
}

/**
 * Every plugin package this build carries, by specifier: the built-in library's own packages
 * (the ones the host package declares — the same list the Plugins page's cards come from) plus
 * whatever a builtin prefix stages on top of them (the desktop app and a hot push stage theirs
 * beside `skills/` — see scripts/build-plugins.mjs). This is the MARKET's shelf: the packages
 * whose entries the index describes even when nobody wrote one by hand.
 *
 * It is not the deployment's answer to "may this Project ask for it": a Project's plugin list
 * takes MODULE plugins (packages with a code entry the server can load), which is
 * `discoverBuiltinPlugins` over the builtin prefixes and nothing else — a skills/hooks package
 * has no entry file, so listing one there would only produce a row that fails to load.
 */
export async function shippedPluginNames(
  root: string,
  bases: readonly PluginBase[],
): Promise<string[]> {
  const names = new Set(builtinLibraryNames(root));
  for (const name of await discoverBuiltinPlugins(bases)) names.add(name);
  return [...names].sort();
}

/**
 * Where one plugin package's own files are: its directory, or null when this machine does not
 * have it. Two kinds of package are on the shelf and they are found differently — a LIBRARY
 * package (the ones core carries, `@lmliheng/<directory>`) through core, which resolves them
 * from its own `node_modules` chain and knows a checkout's `plugins/<name>/` is the copy to
 * read; a staged MODULE plugin (a sandbox backend, seeded by a push) from the bases, the same
 * lookup a Project's install goes through. Nothing is assumed about either: whatever the
 * resolution finds is the package.
 */
function packageDir(specifier: string, bases: readonly PluginBase[]): string | null {
  if (specifier.startsWith(PLUGIN_SCOPE)) {
    const dir = builtinPluginDir(specifier.slice(PLUGIN_SCOPE.length));
    if (dir !== undefined) return dir;
  }
  return resolvePluginPackage(specifier, bases)?.dir ?? null;
}

/**
 * One catalogue entry for a plugin package on this machine, read from the package itself. A
 * plugin package carries two manifests and they answer different questions: `plugin.json` is
 * the PLUGIN's (its version, its category — the same version the Plugins page's card shows),
 * `package.json` is the npm package's (its description, license, keywords). Both are read, and
 * the entry takes each field from where it belongs; a code-only backend has no plugin.json and
 * falls back to the package's own version. Null when the package is not here, or when what it
 * does carry cannot name it — a catalogue entry invented around a package nobody can read would
 * be worse than the omission.
 *
 * What is deliberately left out: `repository` and `homepage` (a package's own `repository` is
 * a git URL with a directory, not a page the index could link, and guessing the page would put
 * a URL nobody verified in front of the reader), and `updatedAt` (nothing here knows when the
 * package was published).
 */
async function packageIndexEntry(
  name: string,
  bases: readonly PluginBase[],
): Promise<PluginIndexEntry | null> {
  const dir = packageDir(name, bases);
  if (dir === null) return null;
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
  const plugin = await pluginManifest(dir);
  const version = typeof plugin?.version === "string" ? plugin.version : manifest.version;
  const description = manifest.description;
  const license = manifest.license;
  if (
    typeof version !== "string" ||
    typeof description !== "string" ||
    typeof license !== "string"
  ) {
    return null;
  }
  const category = typeof plugin?.category === "string" ? plugin.category : null;
  const keywords = manifest.keywords;
  return {
    name,
    version,
    description,
    authors: [PUBLISHER],
    license,
    ...(category !== null && category !== "" ? { categories: [category] } : {}),
    ...(Array.isArray(keywords) && keywords.every((k) => typeof k === "string")
      ? { keywords: keywords as string[] }
      : {}),
  };
}

/** A plugin package's own manifest (`plugin.json` beside its `package.json`), or null when it has none — a code-only backend carries only the npm one. */
async function pluginManifest(dir: string): Promise<Record<string, unknown> | null> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(path.join(dir, "plugin.json"), "utf8"));
    return raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** What the built-in registry needs: where packages resolve from, and which names are this build's own. */
export interface BuiltinRegistryDeps {
  /** Where a package is looked up (the shipped prefix, the data root's, the installation). */
  bases?: () => readonly PluginBase[];
  /**
   * The plugin packages this build ships (see shippedPluginNames). The entries the embedded
   * index already carries are left as they are — it is the curated listing; this describes the
   * rest of the shelf from the packages themselves, so a plugin that ships is on the market
   * without anyone writing a second copy of its name, version and description by hand.
   */
  shipped?: () => Promise<readonly string[]>;
}

/**
 * The registry embedded in this package: the workspace's own plugin packages. The index is the
 * curated entries plus one entry per shipped package they do not already carry. A readme is the
 * package's own README.md, read from the copy on this machine (see packageDir) — the file the
 * package ships, never a second copy. A listed package that is not on this machine has none to
 * show, and one whose package ships no README serves none.
 */
export function builtinPluginRegistry(deps: BuiltinRegistryDeps = {}): PluginRegistry {
  const { bases = () => [], shipped = async () => [] } = deps;
  return {
    source: BUILTIN_REGISTRY_SOURCE,
    // Validated like any other source: a broken embedded index should fail loudly
    // in tests rather than serve garbage.
    index: async () => {
      const curated = parsePluginIndex(builtinIndex, BUILTIN_REGISTRY_SOURCE);
      const listed = new Set(curated.map((entry) => entry.name));
      const derived: PluginIndexEntry[] = [];
      for (const name of await shipped()) {
        if (listed.has(name)) continue;
        listed.add(name);
        const entry = await packageIndexEntry(name, bases());
        if (entry !== null) derived.push(entry);
      }
      return [...curated, ...derived];
    },
    readme: async (name) => {
      const dir = packageDir(name, bases());
      if (dir === null) return null;
      try {
        return await fs.readFile(path.join(dir, "README.md"), "utf8");
      } catch {
        return null;
      }
    },
  };
}

/** A registry behind an `index.json` URL; `fetchImpl` is injectable for tests. */
export function httpPluginRegistry(
  indexUrl: string,
  fetchImpl: typeof fetch = fetch,
): PluginRegistry {
  return {
    source: indexUrl,
    index: async () => {
      const res = await fetchImpl(indexUrl);
      if (!res.ok) {
        throw new Error(`plugin index from ${indexUrl} answered HTTP ${res.status}`);
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error(
          `plugin index from ${indexUrl} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return parsePluginIndex(data, indexUrl);
    },
    // The shared index format carries no readme location, so a remote source has none to
    // offer yet. Null rather than a guessed URL: inventing one would have the Web App
    // render whatever answered it.
    readme: () => Promise.resolve(null),
  };
}
