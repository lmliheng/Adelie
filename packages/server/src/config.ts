/**
 * Server runtime config (ServerConfig) — parsed from environment variables.
 *
 * The data root directory is shared with the SDK / CLI (`resolveRoot()`:
 * ADELIE_HOME or ~/.adelie/data); the SQLite index database defaults to
 * `<root>/web.db` (overridable via ADELIE_WEB_DB, tests use ":memory:").
 * In production, the SPA is served statically once the frontend build output
 * directory (ADELIE_WEB_DIST, the bundled web-dist/, or ../web/dist) is
 * detected to exist.
 * The five deployment variables below are read in both spellings — see
 * core's state/boundary-env.ts for why their writers are outside this repository.
 * Docs: /docs/configuration § "Environment variables".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  boundaryEnv,
  DEFAULT_SERVER_PORT,
  LEGACY_ROOT_ENV,
  resolveRoot,
  ROOT_ENV,
} from "@lmliheng/penguin-core";
import { checkoutCliEntry } from "./services/cli-shim.js";

export interface ServerConfig {
  /** Local data root directory (shared with the SDK/CLI). */
  root: string;
  /** HTTP listen address and port (defaults to 127.0.0.1:4000, Adelie's own Web port — upstream serves on 7364). */
  host: string;
  /**
   * Listen port. `0` asks the OS for an ephemeral port (the desktop shell always does),
   * in which case the value is only a request: index.ts writes the ACTUAL bound port back
   * here once listening, because preview URLs are built from the server's own port rather
   * than the browser's (dev serves the SPA on a different port; see resolvePreviewTarget).
   */
  port: number;
  /** SQLite database path; ":memory:" for test injection. */
  dbPath: string;
  /** Frontend static assets directory; whether it's enabled is decided by checking existence when the app is assembled. */
  webDist: string;
  /**
   * Origin that serves Workspace HTML previews (ADELIE_PREVIEW_ORIGIN), e.g.
   * `https://preview.example.com`. It must differ from the App origin by **hostname** —
   * cookies ignore ports, so a second port would still share the session cookie. Unset
   * is the norm locally: the loopback counterpart (`127.0.0.1` <-> `localhost`) is
   * derived per request instead.
   */
  previewOrigin: string | null;
  /** Trusted Penguin Go origin; never supplied by a browser request. */
  penguinGoOrigin: string;
  /**
   * Base URL of the ModelScope authorization bridge (MODELSCOPE_BRIDGE_URL), without a
   * trailing slash — e.g. `https://go.penguin.ooo/modelscope`. The harness sends the
   * start/poll exchange here and never to ModelScope itself: the bridge holds the OAuth
   * client secret. Unlike `penguinGoOrigin` this value carries a path prefix in production,
   * because the bridge is mounted under one and strips it from the incoming request.
   */
  modelscopeBridgeUrl: string;
  /**
   * Fixed initial password for the seeded built-in admin (ADELIE_SEED_ADMIN_PASSWORD),
   * used by automated tests and e2e. Null is the norm: the seed then generates a random
   * password that is hashed and discarded unseen, and the account is claimed through the
   * first-login link instead.
   */
  seedAdminPassword: string | null;
  /** Login session validity period (30 days). */
  authSessionTtlMs: number;
  /**
   * Sliding renewal threshold: a session validated with less than this much left is renewed to
   * the full TTL. Set one day below the TTL, so any session used at least a day after it was
   * issued renews — in practice a session in regular use never expires, and the TTL is the
   * idle timeout.
   */
  authSessionRenewMs: number;
  /**
   * Desktop mode (ADELIE_DESKTOP_TOKEN; the pre-rename PENGUIN_DESKTOP_TOKEN is read too): the
   * per-launch token minted by the desktop
   * shell. Non-null enables the one-shot claim link and the Bearer-token shutdown
   * endpoints and requires a loopback HOST — desktop mode passes the token through a
   * URL, which must never leave the machine.
   */
  desktopToken: string | null;
  /**
   * Whether `penguin server|web` supervises this process (ADELIE_SUPERVISED=1) and relaunches
   * it when it exits with core's SERVER_RESTART_EXIT_CODE — what makes the web UI's "restart
   * to update" possible. False under a direct server start, a dev run, or the desktop shell.
   *
   * Required, unlike cliEntry below: the hot-update seam names it in the
   * config interface it claims (hmr/capabilities.ts's HMR_INTERFACES), and a runtime that
   * publishes a lifecycle capability publishes this field with it — the two arrived together.
   */
  supervised: boolean;
  /**
   * Port announcement file (ADELIE_PORT_FILE; PENGUIN_PORT_FILE is read too): once the App is up,
   * the actual
   * bound port is written here — the supervising process's way to learn the port when
   * it starts the server with PORT=0.
   */
  portFile: string | null;
  /**
   * Trust `x-forwarded-proto` from the request (ADELIE_TRUST_PROXY=1). Off by default:
   * the header is caller-supplied, so on a non-loopback bind an untrusted caller could
   * set it to `https` to walk through the hot-update network gate (hmr/routes.ts) while
   * actually speaking plaintext — or get session cookies stamped `Secure` over plain HTTP,
   * which the browser then never sends back (a sign-in that never takes). Enable this only
   * behind a reverse proxy that terminates TLS and either sets or strips the header itself
   * before it reaches this process; an HTTPS deployment that leaves it off issues session
   * cookies WITHOUT the `Secure` flag (auth/middleware.ts cookieOptions).
   */
  trustProxy: boolean;
  /**
   * The CLI entry script this harness offers to the Agents it runs — the file the
   * `<root>/bin/penguin` shim execs (see services/cli-shim.ts). `ADELIE_CLI_ENTRY` when
   * set (`PENGUIN_CLI_ENTRY` is read too — the desktop shell passes that spelling, and its
   * launch environment is not built in this repository, see state/boundary-env.ts):
   * `penguin server|web` exports its own
   * entry there, and the desktop shell passes
   * the bundled one to the server it forks. Otherwise the entry of the checkout this
   * server was started from, when it has a built one. Null = no CLI to offer, and no shim
   * is written.
   *
   * Related to but wider than the self-update endpoint's use of the same variable
   * (http/routes/version.ts), which accepts only an INSTALLED entry it can re-run as
   * `penguin update`: a checkout has no release to update to, but its CLI is exactly the
   * one an Agent working on that checkout should be running.
   *
   * OPTIONAL for the same reason: absent — a runtime older than this field — reads as null,
   * no CLI to offer and no shim written.
   */
  cliEntry?: string | null;
  /**
   * Feedback endpoint (ADELIE_FEEDBACK_URL): the absolute http(s) URL the Web UI's feedback
   * entry posts to, with ADELIE_FEEDBACK_KEY sent as its `x-adelie-key` header when set. Null
   * — the default — turns the entry off: an install with no feedback backend has nothing to
   * send its users' words to, and a button that can only fail is worse than no button.
   *
   * The contract is the Adelie requirements box's (`POST /api/requirements`, `{title, detail}`
   * in, `{ok, item}` out) — the same box the patrol rounds read their work from, so feedback
   * filed from the UI lands in the queue an Agent already works through.
   */
  feedbackUrl: string | null;
  /** The feedback endpoint's credential (ADELIE_FEEDBACK_KEY), sent as `x-adelie-key`; null when the endpoint takes none. */
  feedbackKey: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Default frontend build output directory, first match wins:
 * - `<this package>/web-dist`: npm package layout — the release workflow copies the built
 *   web assets into the published package, so an `npm install` gets the Web UI too;
 * - `<this package>/../web/dist`: monorepo layout (resolves the same whether running
 *   from src or dist), also the fallback when neither exists.
 */
function defaultWebDist(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bundled = path.resolve(here, "..", "web-dist");
  if (fs.existsSync(bundled)) return bundled;
  return path.resolve(here, "..", "..", "web", "dist");
}

/**
 * The CLI entry of the checkout this server module lives in, resolved from the module's
 * own location (`packages/server/src/…` under tsx, `packages/server/dist/…` when built,
 * the desktop shell's bundle in a source desktop run — all reached by the same walk to the
 * workspace root). Null outside a checkout, and null when its CLI has not been built.
 */
function defaultCliEntry(): string | null {
  return checkoutCliEntry(path.dirname(fileURLToPath(import.meta.url)));
}

/**
 * Validates ADELIE_PREVIEW_ORIGIN into a bare origin, or throws. An unparseable value
 * is a hard failure rather than a silent fallback: falling back would quietly serve
 * previews same-origin, which is the configuration this variable exists to avoid.
 */
function normalizePreviewOrigin(raw: string | undefined): string | null {
  if (!raw || raw.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`Invalid ADELIE_PREVIEW_ORIGIN=${raw} (expected an absolute origin)`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Invalid ADELIE_PREVIEW_ORIGIN=${raw} (only http/https are supported)`);
  }
  return url.origin;
}

/** HTTPS in production; plain HTTP is accepted only for an explicit loopback integration. */
export function normalizePenguinGoOrigin(raw: string | undefined): string {
  const value = raw?.trim() || "https://token.penguin.ooo";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid PENGUIN_GO_ORIGIN=${value} (expected an absolute HTTP(S) origin)`);
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      `Invalid PENGUIN_GO_ORIGIN=${value} (paths, credentials, query and fragment are not allowed)`,
    );
  }
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(`Invalid PENGUIN_GO_ORIGIN=${value} (HTTPS required except for loopback HTTP)`);
  }
  return url.origin;
}

/**
 * Validates MODELSCOPE_BRIDGE_URL into a base URL with no trailing slash, or throws.
 *
 * Deliberately looser than normalizePenguinGoOrigin in exactly one place: a PATH PREFIX is
 * allowed, because the bridge is mounted under one in production
 * (`https://go.penguin.ooo/modelscope`) and strips it from the request itself — so the
 * prefix is part of the address the client must call. Credentials, query, fragment and
 * plaintext HTTP stay rejected.
 */
export function normalizeModelScopeBridgeUrl(raw: string | undefined): string {
  const value = raw?.trim() || "https://go.penguin.ooo/modelscope";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid MODELSCOPE_BRIDGE_URL=${value} (expected an absolute HTTP(S) URL)`);
  }
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new Error(
      `Invalid MODELSCOPE_BRIDGE_URL=${value} (credentials, query and fragment are not allowed)`,
    );
  }
  if (url.protocol !== "https:") {
    throw new Error(`Invalid MODELSCOPE_BRIDGE_URL=${value} (HTTPS required)`);
  }
  // A bare origin parses as pathname "/", which must become "" rather than stay a slash, or
  // every appended route would read `//oauth/start`.
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * Validates ADELIE_FEEDBACK_URL into an absolute http(s) URL, or null when unset. A blank
 * value counts as unset (the common `.env` case of `ADELIE_FEEDBACK_URL=`), and a malformed
 * one throws here rather than at the first submission: the alternative is a feedback entry
 * that looks live and answers with a network error the operator cannot connect to a typo.
 * Credentials in the URL stay rejected — the key has its own variable, and putting it in the
 * URL would leak it into the journal through the logged request line.
 */
export function normalizeFeedbackUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ADELIE_FEEDBACK_URL=${value} (expected an absolute HTTP(S) URL)`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Invalid ADELIE_FEEDBACK_URL=${value} (only http/https are supported)`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error(`Invalid ADELIE_FEEDBACK_URL=${value} (put the key in ADELIE_FEEDBACK_KEY)`);
  }
  return url.toString();
}

/** Parses server config from environment variables (PORT / HOST / ADELIE_HOME / ADELIE_WEB_DIST / ADELIE_WEB_DB / ADELIE_PREVIEW_ORIGIN / PENGUIN_GO_ORIGIN / MODELSCOPE_BRIDGE_URL / ADELIE_SEED_ADMIN_PASSWORD / ADELIE_DESKTOP_TOKEN / ADELIE_PORT_FILE / ADELIE_TRUST_PROXY / ADELIE_CLI_ENTRY / ADELIE_FEEDBACK_URL / ADELIE_FEEDBACK_KEY; each of the deployment names is also read in its pre-rename `PENGUIN_*` spelling, see state/boundary-env.ts). */
export function resolveServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  // The root is read off the passed environment rather than `process.env` (this function takes
  // one so tests can hand it a fabricated environment), so the two names are spelled here as
  // well as in `resolveRoot()` — imported constants, not literals, so they cannot drift.
  const root = env[ROOT_ENV] ?? env[LEGACY_ROOT_ENV] ?? resolveRoot();
  // An empty PORT string is treated as unset (the common `.env` case of an empty
  // `PORT=`): Number("") === 0 would pass the range check and bind to a random
  // port; this matches the CLI's resolvePort convention.
  const port = Number(env.PORT || DEFAULT_SERVER_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port configuration PORT=${env.PORT}`);
  }
  const host = env.HOST ?? "127.0.0.1";
  const desktopToken = boundaryEnv(env, "desktopToken")?.trim() || null;
  // Desktop mode redeems its token through a URL: never allow it off loopback.
  if (desktopToken !== null && host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Desktop mode requires a loopback HOST (got HOST=${host})`);
  }
  return {
    root,
    host,
    port,
    dbPath: boundaryEnv(env, "webDb") ?? path.join(root, "web.db"),
    webDist: boundaryEnv(env, "webDist") ?? defaultWebDist(),
    previewOrigin: normalizePreviewOrigin(env.ADELIE_PREVIEW_ORIGIN),
    penguinGoOrigin: normalizePenguinGoOrigin(env.PENGUIN_GO_ORIGIN),
    modelscopeBridgeUrl: normalizeModelScopeBridgeUrl(env.MODELSCOPE_BRIDGE_URL),
    // An empty/whitespace value is treated as unset, which leaves the seed to generate one.
    seedAdminPassword: env.ADELIE_SEED_ADMIN_PASSWORD?.trim() || null,
    authSessionTtlMs: 30 * DAY_MS,
    authSessionRenewMs: 29 * DAY_MS,
    desktopToken,
    portFile: boundaryEnv(env, "portFile")?.trim() || null,
    trustProxy: env.ADELIE_TRUST_PROXY === "1",
    supervised: env.ADELIE_SUPERVISED === "1",
    cliEntry: boundaryEnv(env, "cliEntry")?.trim() || defaultCliEntry(),
    feedbackUrl: normalizeFeedbackUrl(env.ADELIE_FEEDBACK_URL),
    // An empty value counts as unset: an endpoint that wants no credential gets no header,
    // rather than an empty one it would have to treat as a wrong key.
    feedbackKey: env.ADELIE_FEEDBACK_KEY?.trim() || null,
  };
}
