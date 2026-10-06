/**
 * The plugin registry: the catalogue a Project's plugin list is picked from.
 *
 * - The shared index format is validated whole: a flat array of per-version entries in order;
 *   a non-array or one malformed entry fails the document, naming the source or the position
 *   (unlike a plugin list's per-entry tolerance).
 * - The builtin catalogue lists the sandbox backends that live in plugins/, each named,
 *   versioned, described and licensed as the package names itself, and serves each one's own
 *   shipped README.md; a listed package not on this machine, a name it does not list and a
 *   remote registry have no readme.
 * - The HTTP registry fetches its index URL and runs the document through the same validator;
 *   an HTTP error, non-JSON and a malformed document fail it. No network: fetch is the suite's
 *   fetch fake.
 * - GET /api/plugins/registry and its readme route need a session; the readme route refuses a
 *   name the deployment does not list and needs the name.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PluginIndexEntry, PluginIndexResponse } from "../src/api/types.js";
import type { PluginBase } from "../src/plugin/loader.js";
import {
  builtinPluginRegistry,
  httpPluginRegistry,
  parsePluginIndex,
  shippedPluginNames,
} from "../src/plugin/registry.js";
import type { PluginRegistry } from "../src/plugin/registry.js";
import { fakeFetch, jsonResponse } from "./fixtures/fetch.js";
import { apiClient, createTestApp, loginAdmin } from "./helpers.js";
import type { TestApp } from "./helpers.js";

const VALID_ENTRY: PluginIndexEntry = {
  name: "@example/penguin-plugin-demo",
  version: "1.0.0",
  description: "A demo plugin.",
  authors: ["Example"],
  license: "MIT",
};

describe("parsePluginIndex", () => {
  it("accepts a flat array of per-version entries and preserves order", () => {
    const doc = [
      VALID_ENTRY,
      { ...VALID_ENTRY, version: "1.1.0", keywords: ["linux"], updatedAt: 1755600000 },
    ];
    const parsed = parsePluginIndex(doc, "test");
    expect(parsed.map((e) => e.version)).toEqual(["1.0.0", "1.1.0"]);
  });

  it("rejects a non-array document and names the source", () => {
    expect(() => parsePluginIndex({ plugins: [] }, "https://x.example/index.json")).toThrow(
      /https:\/\/x\.example\/index\.json is not an array/,
    );
  });

  it("rejects the whole document on one malformed entry, naming its position", () => {
    for (const bad of [
      null,
      { ...VALID_ENTRY, version: 2 },
      { ...VALID_ENTRY, authors: "Example" },
      { ...VALID_ENTRY, keywords: [1] },
      { ...VALID_ENTRY, updatedAt: "yesterday" },
    ]) {
      expect(() => parsePluginIndex([VALID_ENTRY, bad], "test")).toThrow(
        /malformed entry at index 1/,
      );
    }
  });
});

describe("httpPluginRegistry", () => {
  const url = "https://registry.example/index.json";

  it("fetches the index URL and validates the document with the shared parser", async () => {
    const registry = fakeFetch(() => jsonResponse([VALID_ENTRY]));
    const entries = await httpPluginRegistry(url, registry.fetch).index();
    expect(registry.calls.map((call) => call.url)).toEqual([url]);
    expect(entries).toEqual([VALID_ENTRY]);
  });

  it("fails on an HTTP error status, on non-JSON, and on a malformed document", async () => {
    const respond = (body: string, status = 200) =>
      fakeFetch(() => new Response(body, { status })).fetch;
    await expect(httpPluginRegistry(url, respond("[]", 503)).index()).rejects.toThrow(/HTTP 503/);
    await expect(httpPluginRegistry(url, respond("not json")).index()).rejects.toThrow(
      /not valid JSON/,
    );
    await expect(httpPluginRegistry(url, respond('{"plugins":[]}')).index()).rejects.toThrow(
      /not an array/,
    );
  });
});

/**
 * The index asserts a name, version, description and license for every plugin package that
 * lives beside it in this workspace — the curated backend entries and one entry per shipped
 * package, each read from that package's own manifest. None of that is enforced by anything
 * the packages do, so it is asserted here: the listing is the specifier a Project's list
 * names, and a catalogue that describes its entries wrongly is worse than one that omits them.
 * A readme is the package's own README.md, so an entry serves one exactly when its package
 * ships one — and every CURATED entry's package has to, because nothing adds those by hand
 * without saying where they lead.
 */
const PLUGINS_DIR = fileURLToPath(new URL("../../../plugins/", import.meta.url));

interface PackageManifest {
  name: string;
  version: string;
  description?: string;
  license?: string;
  files?: string[];
}

const packages = new Map<string, { dir: string; manifest: PackageManifest }>();
for (const dir of readdirSync(PLUGINS_DIR)) {
  // A worktree can hold a directory a build left behind; only a real package counts.
  if (!existsSync(`${PLUGINS_DIR}${dir}/package.json`)) continue;
  const manifest = JSON.parse(
    readFileSync(`${PLUGINS_DIR}${dir}/package.json`, "utf8"),
  ) as PackageManifest;
  packages.set(manifest.name, { dir, manifest });
}

const ALL_PACKAGES = [...packages.keys()].sort();

/**
 * The packages as npm ships them, staged as a prefix a registry can read from: each listed
 * package's own package.json, plugin.json and README.md under `node_modules/<name>/` — what
 * scripts/build-plugins.mjs installs, minus the code, which nothing here reads. A package that
 * ships no README.md (most of the library's plugins do not, yet) is staged without one.
 */
async function shippedPrefix(
  names: Iterable<string>,
): Promise<{ dir: string; bases: PluginBase[] }> {
  const dir = await mkdtemp(path.join(tmpdir(), "penguin-shipped-"));
  const listed = [...names].filter((name) => packages.has(name));
  await writeFile(
    path.join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "penguin-builtin-plugins",
        private: true,
        // The prefix names what it carries, which is what discoverBuiltinPlugins reads it for
        // (scripts/build-plugins.mjs writes the same field).
        dependencies: Object.fromEntries(
          listed.map((name) => [name, packages.get(name)!.manifest.version]),
        ),
      },
      null,
      2,
    )}\n`,
  );
  for (const name of listed) {
    const pkg = packages.get(name)!;
    const dest = path.join(dir, "node_modules", ...name.split("/"));
    await mkdir(dest, { recursive: true });
    for (const file of ["package.json", "plugin.json", "README.md"]) {
      const from = path.join(PLUGINS_DIR, pkg.dir, file);
      if (!existsSync(from)) continue;
      await cp(from, path.join(dest, file));
    }
  }
  return { dir, bases: [{ file: path.join(dir, "package.json"), builtin: true }] };
}

/** The registry as this checkout serves it: every package in plugins/ staged as shipped. */
async function workspaceRegistry(): Promise<{ dir: string; registry: PluginRegistry }> {
  const staged = await shippedPrefix(ALL_PACKAGES);
  return {
    dir: staged.dir,
    registry: builtinPluginRegistry({
      bases: () => staged.bases,
      shipped: async () => ALL_PACKAGES,
    }),
  };
}

describe("plugin readmes", () => {
  /**
   * The detail page's whole content. A curated entry with no readme renders an empty page,
   * which is a gap nobody sees until they click it — so the pairing is pinned here rather
   * than left to whoever adds the next backend.
   */
  it("every curated entry has one, read from the package on this machine", async () => {
    const index = await builtinPluginRegistry().index();
    const staged = await shippedPrefix(index.map((e) => e.name));
    try {
      const registry = builtinPluginRegistry({ bases: () => staged.bases });
      for (const entry of index) {
        const readme = await registry.readme(entry.name);
        expect(readme, `${entry.name} has no readme`).not.toBeNull();
        expect(readme).toContain("#");
      }
    } finally {
      await rm(staged.dir, { recursive: true, force: true });
    }
  });

  /**
   * The other half, for the entries derived from the packages: what a package ships is what
   * the entry serves, so an entry without one is a package without one — never an invented
   * document, and never the wrong package's.
   */
  it("an entry serves its package's own readme when the package ships one, and none when it does not", async () => {
    const { dir, registry } = await workspaceRegistry();
    try {
      for (const entry of await registry.index()) {
        const pkg = packages.get(entry.name)!;
        const own = path.join(PLUGINS_DIR, pkg.dir, "README.md");
        const readme = await registry.readme(entry.name);
        if (existsSync(own)) {
          expect(readme, `${entry.name} ships a readme but serves none`).toBe(
            readFileSync(own, "utf8"),
          );
          expect(pkg.manifest.files, `${entry.name} would publish without its readme`).toContain(
            "README.md",
          );
        } else {
          expect(readme, `${entry.name} has none to serve`).toBeNull();
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("a listed package that is not on this machine has none, rather than an invented one", async () => {
    const [first] = await builtinPluginRegistry().index();
    expect(await builtinPluginRegistry().readme(first!.name)).toBeNull();
    expect(await builtinPluginRegistry().readme("@someone/not-listed")).toBeNull();
  });

  /**
   * A remote index cannot describe where its readmes live yet, so the HTTP registry
   * answers null instead of guessing a URL and rendering whatever replied.
   */
  it("a remote registry offers none", async () => {
    expect(await httpPluginRegistry("https://example.invalid/index.json").readme("x")).toBeNull();
  });
});

describe("the builtin catalogue and the packages it lists", () => {
  it("puts every shipped package on the shelf, each described by the package itself", async () => {
    const { dir, registry } = await workspaceRegistry();
    try {
      const index = await registry.index();
      // Valid under the format every registry is held to.
      expect(parsePluginIndex(index, "builtin")).toEqual(index);
      expect(index.map((entry) => entry.name).sort()).toEqual(ALL_PACKAGES);
      for (const entry of index) {
        const pkg = packages.get(entry.name)!;
        // The PLUGIN's version where the package carries one (plugin.json is what the Plugins
        // page's card shows), the npm package's otherwise — and both are the package's own.
        const declared = path.join(PLUGINS_DIR, pkg.dir, "plugin.json");
        const pluginVersion = existsSync(declared)
          ? (JSON.parse(readFileSync(declared, "utf8")) as { version?: string }).version
          : undefined;
        expect(pluginVersion ?? pkg.manifest.version, entry.name).toBe(entry.version);
        expect(pkg.manifest.description, entry.name).toBe(entry.description);
        expect(pkg.manifest.license, entry.name).toBe(entry.license);
        expect(entry.authors, entry.name).toEqual(["Prism Shadow"]);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stands a skills plugin on the shelf its plugin.json names, and keeps the curated backend's", async () => {
    const { dir, registry } = await workspaceRegistry();
    try {
      const index = await registry.index();
      for (const entry of index) {
        const pkg = packages.get(entry.name)!;
        const declared = path.join(PLUGINS_DIR, pkg.dir, "plugin.json");
        if (!existsSync(declared)) continue;
        const category = (JSON.parse(readFileSync(declared, "utf8")) as { category?: string })
          .category;
        expect(entry.categories, entry.name).toEqual([category]);
      }
      // The sandbox backends have no plugin.json; the curated index is what names their shelf.
      const backend = index.find(
        (entry) => entry.name === "@lmliheng/penguin-plugin-sandbox-bwrap",
      );
      expect(backend?.categories).toEqual(["sandbox"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps the curated list as it is written, and omits a shipped package this machine lacks", async () => {
    const registry = builtinPluginRegistry({ shipped: async () => ["@acme/not-on-this-machine"] });
    expect((await registry.index()).map((entry) => entry.name)).toEqual(
      (await builtinPluginRegistry().index()).map((entry) => entry.name),
    );
  });

  /**
   * The library's packages are the ones nothing stages into a prefix — the host package declares
   * them and core resolves them from wherever it itself resolves anything. With no bases at all
   * (a deployment that has never received a push, a checkout): the shelf must still describe
   * them, from the copy core reads, or A's entries would exist only where a prefix happens to
   * carry the package too.
   */
  it("derives a library package's entry with no bases to resolve from, from the copy core reads", async () => {
    const registry = builtinPluginRegistry({ shipped: async () => ["@lmliheng/requirements-box"] });
    const entry = (await registry.index()).find((e) => e.name === "@lmliheng/requirements-box");
    const dir = path.join(PLUGINS_DIR, packages.get("@lmliheng/requirements-box")!.dir);
    const own = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
      description: string;
      license: string;
      keywords: string[];
    };
    const declared = JSON.parse(readFileSync(path.join(dir, "plugin.json"), "utf8")) as {
      version: string;
      category: string;
    };
    expect(entry).toMatchObject({
      name: "@lmliheng/requirements-box",
      version: declared.version,
      description: own.description,
      license: own.license,
      categories: [declared.category],
      keywords: own.keywords,
      authors: ["Prism Shadow"],
    });
    // The readme too: a package that ships one serves it, resolved the same way.
    expect(await registry.readme("@lmliheng/requirements-box")).toBe(
      readFileSync(path.join(dir, "README.md"), "utf8"),
    );
  });
});

describe("what this build ships", () => {
  /**
   * The market's shelf: the library's own packages (the host package declares them — what the
   * Plugins page's cards are built from) plus what a builtin prefix stages on top of them. It is
   * broader than the deployment's gate on what a Project may ask for — that one is the module
   * plugins the builtin prefixes declare, seeded by a push (see the loader) — because the shelf
   * also holds the skills/hooks packages a Project never lists.
   */
  it("is the built-in library plus the staged prefix, not the prefix alone", async () => {
    const staged = await shippedPrefix(["@lmliheng/penguin-plugin-sandbox-bwrap"]);
    try {
      const names = await shippedPluginNames(staged.dir, staged.bases);
      expect(names).toContain("@lmliheng/penguin-plugin-sandbox-bwrap");
      expect(names).toContain("@lmliheng/csu-mail");
      expect(names).toContain("@lmliheng/requirements-box");
    } finally {
      await rm(staged.dir, { recursive: true, force: true });
    }
  });
});

describe("the registry routes", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it("requires auth, then serves the builtin index", async () => {
    expect((await t.app.request("/api/plugins/registry")).status).toBe(401);

    const admin = await loginAdmin(t.app);
    const res = await apiClient(t.app, admin.cookie).get("/api/plugins/registry");
    expect(res.status).toBe(200);
    const body = (await res.json()) as PluginIndexResponse;
    // Valid under the format, and the curated entries are on it whatever else the build ships.
    expect(parsePluginIndex(body.plugins, "builtin")).toEqual(body.plugins);
    const names = body.plugins.map((entry) => entry.name);
    for (const entry of await builtinPluginRegistry().index()) {
      expect(names, entry.name).toContain(entry.name);
    }
  });

  it("requires auth, then serves a listed entry's readme from the package on this machine", async () => {
    const name = "@lmliheng/penguin-plugin-sandbox-bwrap";
    const url = `/api/plugins/registry/readme?name=${encodeURIComponent(name)}`;
    expect((await t.app.request(url)).status).toBe(401);

    // The package as npm installs it into the data root's own prefix — the first base the
    // lookup tries, ahead of the installation's (which, in a checkout, is the workspace).
    const admin = await loginAdmin(t.app);
    const pkg = packages.get(name)!;
    const dest = path.join(t.root, "plugins", "node_modules", ...name.split("/"));
    await mkdir(dest, { recursive: true });
    await writeFile(
      path.join(t.root, "plugins", "package.json"),
      '{"name":"prefix","private":true}',
    );
    for (const file of ["package.json", "README.md"]) {
      await cp(path.join(PLUGINS_DIR, pkg.dir, file), path.join(dest, file));
    }
    const res = await apiClient(t.app, admin.cookie).get(url);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; readme: string | null };
    expect(body.name).toBe(name);
    expect(body.readme).toContain("Bubblewrap");
  });

  it("refuses a name the deployment does not list, so it cannot probe for what exists", async () => {
    const admin = await loginAdmin(t.app);
    const res = await apiClient(t.app, admin.cookie).get(
      "/api/plugins/registry/readme?name=" + encodeURIComponent("@someone/not-listed"),
    );
    expect(res.status).toBe(404);
  });

  it("requires the name", async () => {
    const admin = await loginAdmin(t.app);
    expect((await apiClient(t.app, admin.cookie).get("/api/plugins/registry/readme")).status).toBe(
      400,
    );
  });
});
