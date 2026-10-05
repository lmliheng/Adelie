/**
 * Remote plugin download: turns what an operator typed — a URL, or the name of an npm package —
 * into the archive to install. Three concerns, in one place because the route needs all of them
 * and none is a route: `normalizePluginUrl` reads a URL (and rewrites the two GitHub shapes into
 * the archive URL they stand for), `parseNpmPluginSpec`/`resolvePluginSource` read an npm package
 * name (and rewrite it into its tarball, asking the registry which one `latest` is today), and
 * `fetchPluginArchive` performs the one outbound request and bounds it.
 *
 * A plugin archive is a zip, or a published npm package's `.tgz`, whose contents carry
 * `plugin.json` somewhere; where exactly, and in which of the two formats, is the installer's
 * question (http/routes/plugins.ts + services/tar-archive.ts), not this module's — a plain
 * download link is passed through untouched.
 *
 * Why npm at all: every plugin in the library IS an npm package (`@penguinharness/<name>`, see
 * plugins/README.md), so an operator publishes theirs there and installs it here by name, without
 * a repository checkout or a zip to hand around. That is what the registry lookup below is for —
 * a name and an optional version in, the tarball npm serves for them out.
 *
 * Safety: the URL is a server-side request an administrator controls, so it is not a
 * user-supplied fetch — but a redirect or a typo could still aim the server at its own network.
 * `isBlockedHost` refuses the obvious cases (loopback, private and link-local literals, the
 * `.local`/`.internal` names) before the request and again on the URL that answered. It is a
 * literal-host guard, not a DNS guard: a public name resolving to an internal address is not
 * caught here, which is the right trade for an admin-only endpoint on a self-hosted server and
 * would not be for one reachable by every user.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { HttpError } from "../http/errors.js";
import { badRequest } from "../http/validate.js";

/**
 * Cap for a downloaded archive. Larger than the upload routes' 14MB on purpose: that number
 * exists to keep a base64 body inside the request limit, and nothing is base64 here. What is
 * fetched is often a whole repository — a GitHub tree URL downloads the checkout the plugin
 * lives in — so 32MB is what "a plugin archive" means over the network, while the plugin that
 * comes out of it is capped by the same content limits either way (see unzipBounded).
 */
export const MAX_PLUGIN_ARCHIVE_BYTES = 32 * 1024 * 1024;

/**
 * How long one download may take. Generous compared with a balance query — this pulls a file,
 * not a status — but bounded, so an unresponsive host cannot pin a request handler.
 */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/** A source, read: what to fetch, which subdirectory inside the archive is the plugin, and the name that source suggests. */
export interface PluginArchiveSource {
  /** The URL to fetch (the GitHub archive URL when the input was a repository page, the tarball when it was an npm package). */
  fetchUrl: string;
  /** Path inside the archive under which the plugin root must live ("" = anywhere, the shallowest plugin root wins). */
  subdir: string;
  /** The name the source suggests (a GitHub repository, a tree URL's directory, an npm package's own name); undefined when only the archive's own layout can say. */
  name?: string;
  /**
   * The checksum the source published for this archive (Subresource Integrity, as npm's
   * `dist.integrity` is written: `<algorithm>-<base64>`), checked after the download. Present only
   * when a registry named the tarball — an operator's own URL makes no claim to verify.
   */
  integrity?: string;
}

/**
 * Reads an operator-typed URL into the fetch it stands for. Accepted:
 * - a zip URL (anything http/https ending in `.zip`, or any URL whose response turns out to be
 *   an archive — the extension is not required, only used to suggest a name);
 * - `https://github.com/<owner>/<repo>` → that repository's default branch (`…/archive/HEAD.zip`);
 * - `https://github.com/<owner>/<repo>/tree/<ref>[/<sub…>]` → that ref, with `sub` as the
 *   subdirectory to look in (this is the shape a "copy the URL of the folder" gesture yields).
 * Anything else on github.com is not an archive (a `blob` page, a user page) → 400.
 */
export function normalizePluginUrl(raw: string): PluginArchiveSource {
  const trimmed = raw.trim();
  if (trimmed === "") throw badRequest("url must not be empty.");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new HttpError(400, "unsupported_url", "url must be an absolute http(s) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "unsupported_url", "url must be an http(s) URL.");
  }
  assertHostAllowed(url);

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "github.com") {
    // A plain link: fetched as given. The file name suggests a name only when it is an archive
    // (a zip, or the `.tgz` npm publishes) — any other link names nothing by itself.
    const file = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const suggested = archiveStem(file);
    return { fetchUrl: url.toString(), subdir: "", ...(suggested ? { name: suggested } : {}) };
  }

  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [owner, repo, kind, ...rest] = segments;
  if (!owner || !repo) {
    throw new HttpError(
      400,
      "unsupported_url",
      "Not a GitHub repository URL: expected /<owner>/<repo>.",
    );
  }
  const repoUrl = `https://github.com/${owner}/${repo}`;
  if (kind === undefined) {
    // The repository page: its default branch. `HEAD` needs no API call to resolve.
    return { fetchUrl: `${repoUrl}/archive/HEAD.zip`, subdir: "", name: repo };
  }
  // `/archive/…`, `/releases/download/…`, `/raw/…`: already a download link, passed through.
  if (kind !== "tree") {
    return { fetchUrl: url.toString(), subdir: "", name: repo };
  }
  const [ref, ...sub] = rest;
  if (!ref) throw new HttpError(400, "unsupported_url", "A GitHub tree URL needs a branch or tag.");
  const subdir = sub.join("/");
  return {
    fetchUrl: `${repoUrl}/archive/${encodeURIComponent(ref)}.zip`,
    subdir,
    // The plugin directory is the last segment of the subdirectory — that is its name.
    name: sub.length > 0 ? sub[sub.length - 1]! : repo,
  };
}

/** The one npm registry this reads: npm's own. A mirror would be a second constant, not a setting to guess at. */
const NPM_REGISTRY = "https://registry.npmjs.org";

/** An npm package name: `name` or `@scope/name`, in the character set npm allows. */
const NPM_NAME = /^(?:@[A-Za-z0-9._~!*'()-]+\/)?[A-Za-z0-9._~!*'()-]+$/;
/** A version or a dist-tag (`latest`, `next`): what can be looked up in a packument directly. A range cannot. */
const NPM_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/** Which npm package an import names, and which of its versions (absent = whatever `latest` is today). */
export interface NpmPluginSpec {
  name: string;
  version?: string;
}

/**
 * The npm package a piece of operator input names, or null when it names none. Accepted:
 * - `npm:<name>[@<version>]` — the explicit spelling, and the only one a bare name cannot be
 *   confused with;
 * - `https://www.npmjs.com/package/<name>[/v/<version>]` — the page an npm search ends on;
 * - a bare `<name>[@<version>]`, the shortest thing an operator can type.
 *
 * A version is an exact version or a dist-tag, not a range: resolving a range would mean carrying
 * a semver resolver into the server for a feature whose answer the operator usually knows. Anything
 * that fails these patterns is null, which the callers turn into "that is not a plugin address".
 */
export function parseNpmPluginSpec(raw: string): NpmPluginSpec | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.toLowerCase().startsWith("npm:")) {
    return parseNpmName(trimmed.slice("npm:".length).trim());
  }
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "npmjs.com") {
      const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      if (segments[0] !== "package") return null;
      // `…/package/@scope/name/v/1.2.3`: the name is one segment unless it is scoped.
      const scoped = segments[1] === undefined ? undefined : segments[1].startsWith("@");
      const name = scoped ? `${segments[1]}/${segments[2] ?? ""}` : segments[1];
      if (name === undefined || name.endsWith("/")) return null;
      const marker = scoped ? 3 : 2;
      const version = segments[marker] === "v" ? segments[marker + 1] : undefined;
      return parseNpmName(version === undefined ? name : `${name}@${version}`);
    }
    if (host === "registry.npmjs.org") {
      // The packument URL itself: `/@scope%2Fname`, or `/name` — what `npm view` would call. The
      // scope's slash is percent-encoded INSIDE the name, so the path is decoded before it is
      // split: decoding each segment separately would leave a name with a slash in one segment.
      const rest = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const segments = rest.split("/");
      if (segments[0] === undefined || segments[0] === "") return null;
      const scoped = segments[0].startsWith("@");
      const name = scoped ? `${segments[0]}/${segments[1] ?? ""}` : segments[0];
      // A version in the path would answer with a single version's manifest rather than the
      // package's versions, which is not what this reader asks the registry for.
      if (name.endsWith("/") || segments.length > (scoped ? 2 : 1)) return null;
      return parseNpmName(name);
    }
    return null;
  }
  return parseNpmName(trimmed);
}

/** `name[@version]` → the pair, or null when either half breaks npm's own rules. */
function parseNpmName(spec: string): NpmPluginSpec | null {
  if (spec === "") return null;
  // The `@` of a scope is the FIRST character, so only a later one separates a version.
  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : undefined;
  if (name.length > 214 || !NPM_NAME.test(name)) return null;
  if (version !== undefined && !NPM_VERSION.test(version)) return null;
  return version === undefined ? { name } : { name, version };
}

/**
 * What an operator typed, as the archive to fetch — the one entry point the route uses.
 *
 * An npm name (see parseNpmPluginSpec) is resolved against the registry, which needs a request of
 * its own: the tarball URL is a function of the version, and `latest` is only known there. Anything
 * else is read as a URL, exactly as before. `fetchImpl`/`timeoutMs` are injectable so the two
 * requests can be tested without a network.
 */
export async function resolvePluginSource(
  raw: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<PluginArchiveSource> {
  const spec = parseNpmPluginSpec(raw);
  if (spec === null) return normalizePluginUrl(raw);
  const found = await fetchPackument(spec, options);
  const entry = pickVersion(spec, found);
  const tarball = entry.tarball;
  let url: URL;
  try {
    url = new URL(tarball);
  } catch {
    throw new HttpError(400, "download_failed", "The registry named an unreadable tarball URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "download_failed", "The registry named an unsupported tarball URL.");
  }
  assertHostAllowed(url);
  return {
    fetchUrl: url.toString(),
    subdir: "",
    // The package's own name, minus the scope: the scope names a publisher, and the plugin is
    // installed under the name its own repository gives it (`@scope/use-firecrawl` → `use-firecrawl`).
    name: spec.name.slice(spec.name.startsWith("@") ? spec.name.indexOf("/") + 1 : 0),
    ...(entry.integrity !== undefined ? { integrity: entry.integrity } : {}),
  };
}

/** One version of a package, as the registry describes it. */
interface NpmVersionEntry {
  tarball: string;
  integrity?: string;
}

/** The packument of one package, or the refusal that says why it could not be read. */
async function fetchPackument(
  spec: NpmPluginSpec,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<Record<string, unknown>> {
  const doFetch = options.fetchImpl ?? fetch;
  // npm's own encoding of a scoped name: the `@` stays, the scope's slash is percent-encoded.
  const encoded = spec.name.startsWith("@")
    ? `@${encodeURIComponent(spec.name.slice(1))}`
    : encodeURIComponent(spec.name);
  const url = `${NPM_REGISTRY}/${encoded}`;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "GET",
      redirect: "follow",
      // The abbreviated document: dist-tags and each version's dist, which is all this reads, and a
      // fraction of the full packument for a package with a long history.
      headers: { accept: "application/vnd.npm.install-v1+json, application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS),
    });
  } catch (err) {
    throw new HttpError(400, "npm_registry_failed", `Could not reach npm: ${message(err)}`);
  }
  if (res.url) assertHostAllowed(new URL(res.url));
  if (res.status === 404) {
    throw new HttpError(404, "npm_package_not_found", `npm has no package ${spec.name}.`);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new HttpError(
      400,
      "npm_registry_failed",
      `npm answered HTTP ${res.status} for ${spec.name}.`,
    );
  }
  try {
    const data: unknown = await res.json();
    if (typeof data !== "object" || data === null) throw new Error("not an object");
    return data as Record<string, unknown>;
  } catch {
    throw new HttpError(
      400,
      "npm_registry_failed",
      `npm returned no usable data for ${spec.name}.`,
    );
  }
}

/**
 * The version to install: the one asked for, or `latest`. Both are DIRECT lookups — the packument
 * is read as a map of versions with a `dist-tags` table beside it, so neither needs a resolver and
 * a range (which NPM_VERSION already refused) has no meaning here.
 */
function pickVersion(spec: NpmPluginSpec, packument: Record<string, unknown>): NpmVersionEntry {
  const versions = packument["versions"];
  const table =
    typeof versions === "object" && versions !== null ? (versions as Record<string, unknown>) : {};
  const distTags = packument["dist-tags"];
  const tags =
    typeof distTags === "object" && distTags !== null ? (distTags as Record<string, unknown>) : {};
  const version = spec.version ?? (typeof tags["latest"] === "string" ? tags["latest"] : undefined);
  if (version === undefined) {
    throw new HttpError(404, "npm_version_not_found", `${spec.name} has no published version.`);
  }
  const entry = table[version];
  if (typeof entry !== "object" || entry === null) {
    throw new HttpError(
      404,
      "npm_version_not_found",
      `npm has no version ${version} of ${spec.name}; use an exact version or a dist-tag.`,
    );
  }
  const dist = (entry as Record<string, unknown>)["dist"];
  const tarball =
    typeof dist === "object" && dist !== null
      ? (dist as Record<string, unknown>)["tarball"]
      : undefined;
  if (typeof tarball !== "string" || tarball === "") {
    throw new HttpError(404, "npm_version_not_found", `${spec.name}@${version} has no tarball.`);
  }
  const integrity = (dist as Record<string, unknown>)["integrity"];
  const entryOut: NpmVersionEntry = { tarball };
  if (typeof integrity === "string" && integrity !== "") entryOut.integrity = integrity;
  return entryOut;
}

/** The file name of an archive link without its extension (`thing.zip`/`thing.tgz` → `thing`), or undefined for a link that names no archive. */
function archiveStem(file: string): string | undefined {
  const lower = file.toLowerCase();
  for (const suffix of [".tar.gz", ".tgz", ".zip"]) {
    if (lower.endsWith(suffix)) return file.slice(0, -suffix.length);
  }
  return undefined;
}

/** Refuses a host that can only be the server's own network (see the module header). */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  const version = isIP(host);
  if (version === 4) {
    const octets = host.split(".").map(Number);
    const [a, b] = octets as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (version === 6) {
    // ::1 and :: (loopback, unspecified), fe80::/10 (link-local), fc00::/7 (unique-local).
    return (
      /^(0*:)*0*1$/.test(host) ||
      host.startsWith("fe8") ||
      host.startsWith("fe9") ||
      host.startsWith("fea") ||
      host.startsWith("feb") ||
      host.startsWith("fc") ||
      host.startsWith("fd")
    );
  }
  return false;
}

function assertHostAllowed(url: URL): void {
  if (isBlockedHost(url.hostname)) {
    throw new HttpError(
      400,
      "blocked_url",
      `Refusing to fetch from a local or private host: ${url.hostname}`,
    );
  }
}

/**
 * Fetches one plugin archive. Bounded three ways — a deadline, a decoded-size cap enforced
 * while streaming (a `content-length` is a claim, and a chunked response makes no claim at
 * all), and a re-check of the host that actually answered (a redirect may leave the network
 * the URL declared). Every failure is an HttpError the route returns as-is: `download_failed`
 * for a transport error or a non-2xx answer, `plugin_too_large` past the cap.
 */
export async function fetchPluginArchive(
  source: PluginArchiveSource,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<Buffer> {
  const doFetch = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(source.fetchUrl, {
      method: "GET",
      redirect: "follow",
      headers: { accept: "application/zip, application/octet-stream, */*" },
      signal: AbortSignal.timeout(options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS),
    });
  } catch (err) {
    throw new HttpError(400, "download_failed", `Could not download: ${message(err)}`);
  }
  if (res.url) {
    try {
      assertHostAllowed(new URL(res.url));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, "download_failed", "Could not read the URL that answered.");
    }
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new HttpError(400, "download_failed", `Download failed with HTTP ${res.status}.`);
  }
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_PLUGIN_ARCHIVE_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    throw pluginArchiveTooLarge(MAX_PLUGIN_ARCHIVE_BYTES);
  }
  const archive = await readBounded(res);
  if (source.integrity !== undefined) checkIntegrity(source.integrity, archive);
  return archive;
}

/** `<algorithm>-<base64>`, the Subresource Integrity form npm's `dist.integrity` uses. */
const INTEGRITY_PATTERN = /^(sha512|sha384|sha256|sha1)-([A-Za-z0-9+/]+={0,2})$/;

/**
 * Checks the downloaded bytes against the checksum the registry published beside the tarball.
 *
 * HTTPS already authenticates the transfer, so what this adds is the other half: the BYTES the
 * registry vouched for are the bytes that got parsed. A redirect to a mirror, a truncated body
 * that a proxy still called complete, or a registry whose CDN serves something else — all end
 * here rather than in a plugin directory. An algorithm this does not know is passed over rather
 * than guessed at (the digest would be the wrong length and always differ).
 */
function checkIntegrity(integrity: string, archive: Buffer): void {
  const parts = INTEGRITY_PATTERN.exec(integrity);
  if (parts === null) return;
  const expected = Buffer.from(parts[2]!, "base64");
  const actual = createHash(parts[1]!).update(archive).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new HttpError(
      400,
      "integrity_failed",
      "The downloaded archive does not match the checksum the registry published for it.",
    );
  }
}

/** Reads the body, refusing the moment it passes the cap rather than after buffering it all. */
async function readBounded(res: Response): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.from(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PLUGIN_ARCHIVE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw pluginArchiveTooLarge(MAX_PLUGIN_ARCHIVE_BYTES);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * The one "too large" answer, shared by both import routes so an over-size archive reads the
 * same whether it was uploaded or downloaded — each quoting its own cap (the transport decides
 * that number: a base64 request body for an upload, server memory for a download).
 */
export function pluginArchiveTooLarge(limitBytes: number): HttpError {
  return new HttpError(
    413,
    "plugin_too_large",
    `The archive exceeds the ${Math.floor(limitBytes / (1024 * 1024))}MB limit.`,
  );
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
