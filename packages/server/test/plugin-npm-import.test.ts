/**
 * The npm half of the plugin import: an operator names an npm package instead of a URL, and what
 * arrives is a gzipped tar rather than a zip.
 *
 * Three things are pinned here. First the tar reader (services/tar-archive.ts), against archives
 * built byte by byte in this file — a real `npm pack` tarball is a ustar one, so the header walk,
 * the checksum, the `package/` wrapper and a pax long name are exactly what has to work. Second
 * the reader of the specifier itself, which decides what counts as an npm name at all. Third the
 * route end to end, with the registry and the tarball both answered by a stubbed `fetch`: the
 * plugin has to land under the package's own (unscoped) name, and every way the registry can
 * refuse — no such package, no such version, bytes that do not match the published checksum — has
 * to come back as its own code rather than as a generic failure.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginImportResponse, PluginLibraryResponse } from "../src/api/types.js";
import { parsePluginArchive } from "../src/http/routes/plugins.js";
import { parseNpmPluginSpec, resolvePluginSource } from "../src/services/plugin-download.js";
import { apiClient, createTestApp, loginAdmin } from "./helpers.js";
import type { TestApp } from "./helpers.js";

/** A minimal valid plugin: manifest, icon and one skill (the loader requires the SKILL.md frontmatter name). */
function pluginFiles(version = "2026.09.01.1"): Record<string, string> {
  return {
    "plugin.json": `${JSON.stringify(
      {
        description: "A plugin published to npm.",
        short_description: "From npm.",
        version,
        category: "software-development",
      },
      null,
      2,
    )}\n`,
    "icon.svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n',
    "skills/from-npm/SKILL.md":
      "---\nname: from-npm\ndescription: A skill the plugin ships.\n---\n\nBody.\n",
  };
}

const BLOCK = 512;

/** One octal header field: `length` bytes, NUL-terminated, as ustar writes them. */
function octalField(value: number, length: number): string {
  return value.toString(8).padStart(length - 1, "0") + "\0";
}

/** One 512-byte ustar header, checksum included — the format `npm pack` writes. */
function tarHeader(name: string, size: number, type: string): Uint8Array {
  const block = new Uint8Array(BLOCK);
  const put = (text: string, offset: number, length: number) => {
    const bytes = Buffer.from(text, "utf8");
    if (bytes.byteLength > length) throw new Error(`test tar field overflow: ${text}`);
    block.set(bytes, offset);
  };
  put(name, 0, 100);
  put(octalField(0o644, 8), 100, 8);
  put(octalField(0, 8), 108, 8);
  put(octalField(0, 8), 116, 8);
  put(octalField(size, 12), 124, 12);
  put(octalField(0, 12), 136, 12);
  put("        ", 148, 8);
  put(type, 156, 1);
  put("ustar\0", 257, 6);
  put("00", 263, 2);
  let sum = 0;
  for (const byte of block) sum += byte;
  put(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return block;
}

/** A pax extended record: `"<length> <key>=<value>\n"`, the length counting the whole record. */
function paxRecord(key: string, value: string): Buffer {
  const body = ` ${key}=${value}\n`;
  let total = body.length + 1;
  while (String(total).length + body.length !== total) total = String(total).length + body.length;
  return Buffer.from(`${total}${body}`, "utf8");
}

/** One member, as the blocks it occupies: a pax header first when the name outgrows ustar's field. */
function tarMember(name: string, content: string): Uint8Array[] {
  const data = strToU8(content);
  const padded = data.byteLength % BLOCK === 0 ? 0 : BLOCK - (data.byteLength % BLOCK);
  const blocks: Uint8Array[] = [];
  let headerName = name;
  if (Buffer.byteLength(name, "utf8") > 100) {
    const record = paxRecord("path", name);
    blocks.push(
      tarHeader("PaxHeader/ignored", record.byteLength, "x"),
      record,
      new Uint8Array(BLOCK - record.byteLength),
    );
    headerName = name.slice(0, 99);
  }
  blocks.push(tarHeader(headerName, data.byteLength, "0"), data, new Uint8Array(padded));
  return blocks;
}

/** A tar of the given files, ended the way every tar is (two zero blocks). */
function tar(files: Record<string, string>): Buffer {
  const blocks: Uint8Array[] = [];
  for (const [name, content] of Object.entries(files)) blocks.push(...tarMember(name, content));
  blocks.push(new Uint8Array(BLOCK), new Uint8Array(BLOCK));
  return Buffer.concat(blocks);
}

/** The same, gzipped: what the registry serves. */
function tgz(files: Record<string, string>): Buffer {
  return gzipSync(tar(files));
}

/** The files of `pluginFiles()`, as npm packages them: inside `package/`. */
function npmFiles(version = "2026.09.01.1"): Record<string, string> {
  const inner: Record<string, string> = {};
  for (const [rel, text] of Object.entries(pluginFiles(version))) inner[`package/${rel}`] = text;
  return inner;
}

/** A zip of the given files, for the upload half of the route. */
function zip(files: Record<string, string>): Buffer {
  const entries: Record<string, Uint8Array> = {};
  for (const [rel, text] of Object.entries(files)) entries[rel] = strToU8(text);
  return Buffer.from(zipSync(entries));
}

const readErrorCode = async (res: Response): Promise<string> =>
  ((await res.json()) as { error: { code: string } }).error.code;

/** The `sha512-…` form the registry publishes, for the stubs below. */
function integrityOf(bytes: Uint8Array): string {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

describe("parsePluginArchive, on a tarball", () => {
  it("unpacks the package npm wraps in `package/`, under the name the request gives", () => {
    const parsed = parsePluginArchive(tgz(npmFiles()), { name: "from-npm" });
    expect(parsed.name).toBe("from-npm");
    expect(Object.keys(parsed.files).sort()).toEqual([
      "icon.svg",
      "plugin.json",
      "skills/from-npm/SKILL.md",
    ]);
    expect(Buffer.from(parsed.files["plugin.json"]!).toString("utf8")).toContain(
      "A plugin published to npm.",
    );
  });

  it("refuses a tarball that names nothing, because `package/` is the format and not the plugin", () => {
    // The same files as a zip would name the plugin `package`; npm's own wrapper must not.
    expect(() => parsePluginArchive(tgz(npmFiles()))).toThrow(/name is required for a tarball/);
  });

  it("reads a member whose path only a pax extended header carries", () => {
    const long = `${"nested/".repeat(20)}SKILL.md`;
    const files = npmFiles();
    files[`package/extra/${long}`] = "---\nname: deep\ndescription: Deep.\n---\n";
    const parsed = parsePluginArchive(tgz(files), { name: "deep" });
    expect(Object.keys(parsed.files)).toContain(`extra/${long}`);
  });

  it("takes the plugin root out of a tarball that also holds other plugins, by the same rule as a zip", () => {
    const files: Record<string, string> = {};
    for (const [rel, text] of Object.entries(pluginFiles())) {
      files[`package/plugins/one/${rel}`] = text;
      files[`package/plugins/two/${rel}`] = text;
    }
    const parsed = parsePluginArchive(tgz(files), { name: "one", subdir: "plugins/one" });
    expect(Object.keys(parsed.files)).toContain("plugin.json");
  });

  it("refuses a traversing member path, a truncated tarball and one that is not a tar", () => {
    expect(() => parsePluginArchive(tgz({ "package/../escape.txt": "no" }), { name: "x" })).toThrow(
      /Invalid tar entry path/,
    );
    // A member whose header promises more bytes than the archive holds: 4KB of content, cut short.
    const truncated = tar({ "package/notes.txt": "x".repeat(4096) }).subarray(0, 700);
    expect(() => parsePluginArchive(gzipSync(truncated), { name: "x" })).toThrow(/truncated/);
    // Gzip that is not a tar at all: no members, so there is no plugin to find.
    expect(() => parsePluginArchive(gzipSync(Buffer.from("just text")), { name: "x" })).toThrow(
      /no files|no plugin.json/,
    );
  });

  it("refuses a tarball that unpacks past the inflated cap instead of allocating it", () => {
    // What the cap is for: 80MB of zeroes compresses to a few kilobytes, so the compressed size
    // says nothing about what parsing it would cost.
    const bomb = gzipSync(Buffer.alloc(80 * 1024 * 1024));
    expect(() => parsePluginArchive(bomb, { name: "bomb" })).toThrow(/unpacks to more than 64MB/);
  });

  it("applies the plugin file caps to a tarball's members", () => {
    const files = npmFiles();
    for (let i = 0; i < 200; i += 1) {
      files[`package/skills/extra-${i}/SKILL.md`] = `---\nname: extra-${i}\ndescription: F.\n---\n`;
    }
    expect(() => parsePluginArchive(tgz(files), { name: "crowded" })).toThrow(/200-file limit/);
  });

  it("still reads a zip, byte for byte as before", () => {
    const inner: Record<string, string> = {};
    for (const [rel, text] of Object.entries(pluginFiles())) inner[`zipped/${rel}`] = text;
    const parsed = parsePluginArchive(zip(inner));
    expect(parsed.name).toBe("zipped");
    expect(Object.keys(parsed.files).sort()).toEqual([
      "icon.svg",
      "plugin.json",
      "skills/from-npm/SKILL.md",
    ]);
  });
});

describe("parseNpmPluginSpec", () => {
  it("reads the explicit spelling, with and without a version", () => {
    expect(parseNpmPluginSpec("npm:@lmliheng/use-firecrawl")).toEqual({
      name: "@lmliheng/use-firecrawl",
    });
    expect(parseNpmPluginSpec("npm:use-firecrawl@0.2.13")).toEqual({
      name: "use-firecrawl",
      version: "0.2.13",
    });
    expect(parseNpmPluginSpec("NPM:@scope/name@latest")).toEqual({
      name: "@scope/name",
      version: "latest",
    });
  });

  it("reads a bare package name, and the npmjs.com page a search ends on", () => {
    expect(parseNpmPluginSpec("@lmliheng/data-analysis")).toEqual({
      name: "@lmliheng/data-analysis",
    });
    expect(parseNpmPluginSpec("data-analysis")).toEqual({ name: "data-analysis" });
    expect(parseNpmPluginSpec("data-analysis@2026.9.14.1")).toEqual({
      name: "data-analysis",
      version: "2026.9.14.1",
    });
    expect(parseNpmPluginSpec("https://www.npmjs.com/package/@lmliheng/goal")).toEqual({
      name: "@lmliheng/goal",
    });
    expect(parseNpmPluginSpec("https://www.npmjs.com/package/goal/v/0.2.13")).toEqual({
      name: "goal",
      version: "0.2.13",
    });
    expect(parseNpmPluginSpec("https://registry.npmjs.org/@lmliheng%2Fgoal")).toEqual({
      name: "@lmliheng/goal",
    });
  });

  it("reads nothing else — a GitHub page, a version range and a sentence stay addresses", () => {
    expect(parseNpmPluginSpec("https://github.com/o/r")).toBeNull();
    expect(parseNpmPluginSpec("https://example.com/thing.zip")).toBeNull();
    expect(parseNpmPluginSpec("https://www.npmjs.com/settings/tokens")).toBeNull();
    // A range is not a version and not an address: the caller answers 400 unsupported_url, which
    // is the honest answer — this server does not resolve ranges.
    expect(parseNpmPluginSpec("@scope/name@^1.0.0")).toBeNull();
    expect(parseNpmPluginSpec("not a url")).toBeNull();
    expect(parseNpmPluginSpec("  ")).toBeNull();
  });
});

describe("resolvePluginSource", () => {
  const packument = (integrity?: string) => ({
    "dist-tags": { latest: "0.2.13" },
    versions: {
      "0.2.13": {
        dist: {
          tarball: "https://registry.npmjs.org/@scope/name/-/name-0.2.13.tgz",
          ...(integrity !== undefined ? { integrity } : {}),
        },
      },
    },
  });

  it("asks the registry for the package, then names its tarball and the unscoped package name", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input));
      return new Response(JSON.stringify(packument()), { status: 200 });
    }) as typeof fetch;
    const source = await resolvePluginSource("npm:@scope/name", { fetchImpl });
    expect(calls).toEqual(["https://registry.npmjs.org/@scope%2Fname"]);
    expect(source).toEqual({
      fetchUrl: "https://registry.npmjs.org/@scope/name/-/name-0.2.13.tgz",
      subdir: "",
      name: "name",
    });
  });

  it("carries the published checksum along, and the version that was asked for", async () => {
    let asked = "";
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      asked = String(input);
      return new Response(JSON.stringify(packument("sha512-abc")), { status: 200 });
    }) as typeof fetch;
    const source = await resolvePluginSource("name@0.2.13", { fetchImpl });
    expect(asked).toBe("https://registry.npmjs.org/name");
    expect(source.integrity).toBe("sha512-abc");
    expect(source.name).toBe("name");
  });

  it("answers 404 when npm has no such package, and 404 when it has no such version", async () => {
    const missing = (async () =>
      new Response("Not found", { status: 404 })) as unknown as typeof fetch;
    await expect(resolvePluginSource("npm:@scope/absent", { fetchImpl: missing })).rejects.toThrow(
      /npm has no package/,
    );
    const known = (async () =>
      new Response(JSON.stringify(packument()), { status: 200 })) as typeof fetch;
    await expect(resolvePluginSource("name@9.9.9", { fetchImpl: known })).rejects.toThrow(
      /no version 9.9.9/,
    );
  });

  it("leaves every non-npm address to the URL reader", async () => {
    const source = await resolvePluginSource("https://github.com/o/r/tree/main/plugins/x");
    expect(source).toEqual({
      fetchUrl: "https://github.com/o/r/archive/main.zip",
      subdir: "plugins/x",
      name: "x",
    });
    // A tarball link names itself like a zip does.
    expect(await resolvePluginSource("https://example.com/plugins/thing.tgz")).toEqual({
      fetchUrl: "https://example.com/plugins/thing.tgz",
      subdir: "",
      name: "thing",
    });
  });
});

describe("the download route, importing from npm", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;
  let prevHome: string | undefined;

  beforeEach(async () => {
    t = await createTestApp();
    prevHome = process.env.PENGUIN_HOME;
    process.env.PENGUIN_HOME = t.root;
    admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    if (prevHome === undefined) delete process.env.PENGUIN_HOME;
    else process.env.PENGUIN_HOME = prevHome;
    await t.cleanup();
  });

  /** A stubbed registry and CDN: the packument URL answers the document, the `.tgz` URL the tarball. */
  const stubRegistry = (options: { integrity?: string; calls?: string[] } = {}) => {
    const tarball = tgz(npmFiles());
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      options.calls?.push(url);
      if (url.endsWith(".tgz")) return new Response(new Uint8Array(tarball), { status: 200 });
      return new Response(
        JSON.stringify({
          "dist-tags": { latest: "0.2.13" },
          versions: {
            "0.2.13": {
              dist: {
                tarball: "https://registry.npmjs.org/@lmliheng/from-npm/-/from-npm-0.2.13.tgz",
                integrity: options.integrity ?? integrityOf(tarball),
              },
            },
          },
        }),
        { status: 200 },
      );
    });
  };

  const libraryNames = async (): Promise<string[]> => {
    const res = await admin.get("/api/plugins");
    const body = (await res.json()) as PluginLibraryResponse;
    return body.groups.flatMap((g) => g.plugins.map((p) => p.name)).sort();
  };

  it("installs the package's tarball under its unscoped name, files and all", async () => {
    const calls: string[] = [];
    stubRegistry({ calls });
    const res = await admin.post("/api/plugins/download", { url: "@lmliheng/from-npm" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as PluginImportResponse;
    expect(body.plugin).toMatchObject({ name: "from-npm", source: "user" });
    expect(body.path).toBe(path.join(t.root, "plugins", "from-npm"));
    expect(calls).toEqual([
      "https://registry.npmjs.org/@lmliheng%2Ffrom-npm",
      "https://registry.npmjs.org/@lmliheng/from-npm/-/from-npm-0.2.13.tgz",
    ]);
    expect(await libraryNames()).toContain("from-npm");
    const files = (await (await admin.get("/api/plugins/from-npm/files")).json()) as {
      files: Record<string, string>;
    };
    expect(Object.keys(files.files)).toContain("skills/from-npm/SKILL.md");
  });

  it("refuses a tarball whose bytes are not the ones the registry published", async () => {
    // The checksum of OTHER bytes: what a redirected or substituted tarball looks like.
    stubRegistry({ integrity: integrityOf(Buffer.from("tampered")) });
    const res = await admin.post("/api/plugins/download", { url: "npm:from-npm" });
    expect(res.status).toBe(400);
    expect(await readErrorCode(res)).toBe("integrity_failed");
    expect(await libraryNames()).not.toContain("from-npm");
  });

  it("answers npm's own refusals with their own codes, and writes nothing on the way", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    const absent = await admin.post("/api/plugins/download", { url: "npm:@lmliheng/absent" });
    expect(absent.status).toBe(404);
    expect(await readErrorCode(absent)).toBe("npm_package_not_found");

    vi.stubGlobal("fetch", async () => new Response("this is not json", { status: 200 }));
    const unreadable = await admin.post("/api/plugins/download", { url: "npm:@lmliheng/odd" });
    expect(unreadable.status).toBe(400);
    expect(await readErrorCode(unreadable)).toBe("npm_registry_failed");

    vi.stubGlobal("fetch", async () => {
      throw new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
    });
    const offline = await admin.post("/api/plugins/download", { url: "npm:@lmliheng/offline" });
    expect(offline.status).toBe(400);
    expect(await readErrorCode(offline)).toBe("npm_registry_failed");

    expect(await libraryNames()).not.toContain("absent");
  });
});
