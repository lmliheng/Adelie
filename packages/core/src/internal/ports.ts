/**
 * Default Adelie server port (internal shared constant; the barrel re-exports
 * only DEFAULT_SERVER_PORT, as the CLI `penguin server` / `penguin web` and server
 * default-port source of truth — previously each hardcoded the number). It is a
 * fallback only: the `--port` flag and the PORT environment variable override it at
 * runtime.
 */

/**
 * Port and data-root allocation across the repo (documented here because it is the one
 * place a reader looks for it; the dev ports themselves live in vite configs and
 * package.json scripts, neither of which can import this module):
 *
 * | port | who                                | data root                  | where                                |
 * | ---- | ---------------------------------- | -------------------------- | ------------------------------------ |
 * | 4000 | installed server / Web UI          | `~/.adelie/data`           | `DEFAULT_SERVER_PORT` below          |
 * | 7365 | `pnpm dev:web` (Vite)              | none (proxies to 7368)     | `packages/web/vite.config.ts`        |
 * | 7367 | `pnpm dev:docs` (Vite)             | none (static)              | `packages/docs/vite.config.ts`       |
 * | 7368 | `pnpm dev:server` (dev backend)    | `~/.penguin/dev-data`      | `packages/server/package.json` `dev` |
 * | 7370 | `pnpm penguin web` (dev CLI)       | `~/.penguin/dev-data-cli`  | the root and cli `penguin` scripts   |
 * | 7371 | a machine's dev-profile server     | `~/.penguin-dev/data` there | `DEFAULT_DEV_SERVER_PORT` below      |
 * | 7372 | `pnpm dev:gallery` (Vite)          | none (static)              | `packages/ui-gallery/vite.config.ts` |
 *
 * The desktop app binds no fixed port in either form (PORT=0 with a per-instance sticky
 * preference); its release profile shares `~/.adelie/data` with the CLI by design and its
 * dev profile — an unpackaged run, or any build launched with `--dev` — takes
 * `~/.penguin/dev-data` (see `packages/desktop/src/app-identity.ts`). The
 * web e2e harness runs on 8930/8931 against a throwaway root (`packages/web/e2e/run.sh`).
 *
 * Only the release data root is Adelie's own `~/.adelie/data`: the `dev-data` roots above
 * deliberately keep the pre-rename `~/.penguin` home, because the desktop's dev shell names
 * `~/.penguin/dev-data` as the root it shares with `dev:server` (`app-identity.ts`, and the
 * desktop test that pins it) — the two must move together, and the desktop tree is not
 * buildable here. Moving them is the remainder of ledger item 2.2. The **variable names** the
 * dev entries write are Adelie's, though (`ADELIE_HOME` / `ADELIE_PROFILE`); only these paths
 * are still spelled the old way.
 *
 * The release port is Adelie's own number, not the one inherited from upstream. 4000 is where
 * the previous Adelie served its Web UI, so the address people know carries over; upstream
 * PenguinHarness binds 7364, and since the two products are installable side by side, sharing
 * the number would make them fight over the socket. The dev CLI takes 7370 — the old Adelie
 * CLI's `serve` default — and 7370 is a hole in upstream's dev band (7365 / 7368 / 7369 /
 * 7371 / 7372), so a developer running both trees still gets a free port. The dev backend,
 * the dev Web server, the gallery and the machine-forward port below keep upstream's numbers:
 * only the two that a person meets — the installed server and the dev CLI — are Adelie's.
 *
 * The development backend deliberately does **not** share 4000 with an installed one: the
 * two are routinely running at once, and before they were split, `pnpm dev` either failed
 * to bind or -- worse -- the Vite proxy silently talked to the installed server instead of
 * the one being worked on. The dev data root is separated for the same reason.
 *
 * The dev CLI gets a third port rather than reusing the backend's 7368 because the two also
 * run at once: a harness started as `pnpm penguin web` is exactly what asks an Agent to run
 * `pnpm dev` in this repo, and sharing the number would reintroduce that collision one step
 * to the left -- `dev:server` failing to bind, or the Vite proxy answering from the harness.
 * Its data root is split from `dev-data` for the same reason as its port: a data root
 * admits one server at a time (`<root>/server.lock`), so on a shared root the Agent's
 * `dev:server` would refuse to start, blocked by the harness's own lock, no matter how
 * the ports are laid out. The dev desktop shell deliberately stays on `dev-data`: a second
 * server on a locked root is its attach-mode case (the window opens the running
 * instance), not a startup failure, and sharing one dataset between `pnpm dev` and
 * `pnpm desktop` used alternately is the point of the common root.
 *
 * `packages/cli/test/dev-entry-isolation.test.ts` pins the pairwise disjointness of the
 * (port, root) pairs above.
 */

/** Default main server / Web UI port: Adelie's own number, inherited from the Web UI the
 * previous Adelie served on 4000 — the address the installer prints and people bookmark.
 * Upstream PenguinHarness serves on 7364 instead; the table above says why that one is left
 * to it. Unlike 3000/8080 it is not a default anything else reaches for. */
export const DEFAULT_SERVER_PORT = 4000;

/**
 * Where a dev-profile instance starts the server it installs on another machine
 * (`packages/server/src/machines/layout.ts`). Its own number because the release-profile
 * server on that machine holds 4000, and the forward's local port must equal the remote
 * one for Workspace previews to resolve — so the two profiles cannot share a number on
 * either end. Not 7370: the dev CLI holds that one (see the table), and this forward's local
 * port has to stay free on the very developer box that runs the dev CLI.
 */
export const DEFAULT_DEV_SERVER_PORT = 7371;
