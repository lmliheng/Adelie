/**
 * Server directory browsing:
 * GET /api/projects/:p/dirs?path=<absolute>.
 *
 * Lets the user interactively pick a Workspace directory (the Workspace picker). Defaults to
 * the home directory of the account running the service, and can be browsed all the way up
 * to the root `/` — reachability is governed by OS file permissions; the server does not
 * restrict browsing to within the Project directory tree (same convention as
 * workspace-guard). Lists folders and files alike, each with its kind and modification time:
 * the picker shows files dimmed so a folder reads as what it holds, and only folders can be
 * picked.
 *
 * A folder the service account may not read is an error with its own code
 * (`dir_permission_denied`), never an empty listing: on macOS an unanswered privacy prompt
 * (Desktop, Documents, Downloads) looks exactly like that, and an empty list sent people
 * looking for files that were there all along.
 *
 * POST /api/projects/:p/dirs makes one folder inside the folder being browsed, which is the
 * picker's "New folder": see the route for what it refuses.
 *
 * DELETE /api/projects/:p/dirs removes one empty folder, the picker's "Delete": see the route
 * for what it refuses. It is the picker's only destructive verb, so it takes a folder, never a
 * file, and never a whole tree: a folder with anything in it is a refusal, not a walk.
 *
 * POST /api/projects/:p/dirs/access is the picker's way out of that refusal in the desktop
 * app: see the route.
 *
 * `projectId` remains the authorization anchor: the caller must have access to that Project.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { projectDir } from "@prismshadow/penguin-core";
import type {
  DirAccessResponse,
  DirCreateResponse,
  DirDeleteResponse,
  DirEntryInfo,
  DirListResponse,
} from "../../api/types.js";
import type { AppEnv } from "../../auth/middleware.js";
import { HttpError } from "../errors.js";
import { requireValidId } from "../validate.js";
import { Bind, Component, Use } from "@prismshadow/penguin-core/kernel";
import { directorySkillsRoutes } from "./directory-skills.js";
import type { Desktop, DesktopApi, Paths } from "../../hmr/capabilities.js";
import type { Access } from "../../mechanisms/projects.js";

/** What this route group reaches — bound by its module (src/modules). */
export interface DirsRouteDeps {
  access: Access;
  /**
   * The data root, which holds every Project's own directory: what the delete route refuses to
   * remove (a Project's directory, and anything above it).
   */
  root: string;
  /** The desktop shell's service; null when this server was not started by the desktop shell. */
  desktop: Pick<DesktopApi, "requestFolderAccess"> | null;
}

export function dirsRoutes(deps: DirsRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const projectId = requireValidId(c, "projectId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);

    // Default starting point: home directory; an explicit path must be absolute (the frontend always sends back the realpath result).
    const raw = c.req.query("path");
    const requested = raw?.trim() ?? "";
    const home = requested === "";
    const real = await resolveBrowsableDir(home ? os.homedir() : requested);

    let dirents: import("node:fs").Dirent[];
    try {
      dirents = await fs.readdir(real, { withFileTypes: true });
    } catch (err) {
      throw dirReadError(err, real);
    }
    const entries = (await describeEntries(real, dirents)).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const parent = path.dirname(real);
    return c.json({
      path: real,
      parent: parent === real ? null : parent,
      entries,
      platform: process.platform,
      // Drive roots only answer the home request: that is the one the picker makes to build
      // its sidebar, and probing 26 letters on every folder change would be waste.
      ...(home && process.platform === "win32" ? { roots: await driveRoots() } : {}),
    } satisfies DirListResponse);
  });

  /**
   * The picker's "New folder": `parent` is the folder on screen, `name` the single segment to
   * make inside it. The name is joined here rather than taken as a path, so a caller cannot
   * walk out of the folder it is looking at with a separator or a `..` — the whole point of
   * putting the box in the picker is that what it makes lands where the user can see it.
   *
   * It makes exactly one folder: `recursive` is off, so a typo in `parent` is a 404 rather than
   * a silent tree of new folders, and a name already taken is a 409 the picker can point at
   * rather than a silent success. 201 with the path made, which is what the picker selects.
   */
  app.post("/", async (c) => {
    const projectId = requireValidId(c, "projectId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);

    const body = (await c.req.json().catch(() => null)) as {
      parent?: unknown;
      name?: unknown;
    } | null;
    const parent = typeof body?.parent === "string" ? body.parent.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!path.isAbsolute(parent)) {
      throw new HttpError(400, "dir_not_absolute", "Directory must be an absolute path.");
    }
    const bad = dirNameError(name);
    if (bad !== null) throw bad;

    const target = path.join(parent, name);
    try {
      await fs.mkdir(target);
    } catch (err) {
      throw dirCreateError(err, target);
    }
    return c.json({ path: target } satisfies DirCreateResponse, 201);
  });

  /**
   * The picker's "Delete": removes ONE empty folder, the one `path` names. Removal is the only
   * destructive thing the picker can ask of a filesystem it may browse anywhere on, so the
   * route is deliberately narrow. The folder must be empty — a folder with anything in it is a
   * refusal (`dir_not_empty`), never a walk: no recursive delete exists here. A root, the
   * Project's own directory and anything above it are refused outright, and so is a path that
   * names a file: this route removes folders.
   *
   * Every decision reads the resolved path (`realpath`), so a symlink cannot name a forbidden
   * folder indirectly, and the answer names the resolved folder — which is the one that was
   * removed, and the one a picker standing on a link should re-read.
   */
  app.delete("/", async (c) => {
    const projectId = requireValidId(c, "projectId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);

    const body = (await c.req.json().catch(() => null)) as { path?: unknown } | null;
    const requested = typeof body?.path === "string" ? body.path.trim() : "";
    if (!path.isAbsolute(requested)) {
      throw new HttpError(400, "dir_not_absolute", "Directory must be an absolute path.");
    }

    let real: string;
    let isDir: boolean;
    try {
      real = await fs.realpath(requested);
      isDir = (await fs.stat(real)).isDirectory();
    } catch (err) {
      throw dirDeleteError(err, requested);
    }
    if (!isDir) throw new HttpError(400, "not_a_dir", "Not a directory.");

    // A root's own parent is itself (`/` on POSIX, `C:\` on Windows). There is nothing above a
    // root to stand in afterwards, and every path is under one: a root is never a folder to go.
    if (path.dirname(real) === real) {
      throw new HttpError(
        403,
        "dir_root_protected",
        `The root directory cannot be deleted: ${real}.`,
      );
    }
    // The Project's own directory holds its config, its Agents and their Sessions, and every
    // folder above it holds this Project beside others: neither is the picker's to remove.
    if (isSameOrAbove(real, await resolveProjectDir(deps.root, projectId))) {
      throw new HttpError(
        403,
        "dir_project_protected",
        `The Project's directory, or one that contains it, cannot be deleted: ${real}.`,
      );
    }

    try {
      // Emptiness is asked before the removal, so "not empty" is one answer on every platform
      // (Windows reports a folder that still holds something as a permission failure); rmdir
      // stays the operation itself, so a folder that fills up in between still fails.
      if ((await fs.readdir(real)).length > 0) {
        throw new HttpError(409, "dir_not_empty", `The folder is not empty: ${real}.`);
      }
      await fs.rmdir(real);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw dirDeleteError(err, real);
    }
    return c.json({ path: real } satisfies DirDeleteResponse);
  });

  /**
   * The picker's "Allow access" for a folder macOS refused: the desktop shell's main process
   * reads it once in the app's own name, which is what makes macOS ask the user — a read from
   * this server, the shell's child, has been seen to fail silently instead. Once the app is
   * allowed, this server reads the folder too. Only this server's own shell can be asked, so
   * the route has no machine form, and only the desktop app's own window may call it (403
   * `desktop_shell_only`, like the reveal route): a browser tab on the same server has no shell
   * of its own to ask on the user's behalf. Without a shell there is nothing to ask (503
   * `shell_unreachable`); a shell that has not answered within FOLDER_ACCESS_TIMEOUT_MS is a
   * 504 `timeout`. The member is optional: a layer older than the picker's box has none.
   */
  app.post("/access", async (c) => {
    const projectId = requireValidId(c, "projectId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);
    if (c.var.sessionVia !== "desktop") {
      throw new HttpError(
        403,
        "desktop_shell_only",
        "Asking macOS for a folder is available from the desktop app's own window.",
      );
    }
    const body = (await c.req.json().catch(() => null)) as { path?: unknown } | null;
    const target = typeof body?.path === "string" ? body.path.trim() : "";
    if (!path.isAbsolute(target)) {
      throw new HttpError(400, "dir_not_absolute", "Directory must be an absolute path.");
    }
    const asked = deps.desktop?.requestFolderAccess?.(target) ?? null;
    if (asked === null) {
      throw new HttpError(503, "shell_unreachable", "The desktop shell is not listening.");
    }
    const result = await asked;
    if (result === null) {
      throw new HttpError(504, "timeout", "The desktop shell did not answer in time.");
    }
    return c.json({
      granted: result.granted,
      packaged: result.packaged,
    } satisfies DirAccessResponse);
  });

  return app;
}

/**
 * The HTTP answer for a filesystem call that failed on `dir`. A refusal (EACCES, or EPERM —
 * what macOS privacy protection returns for a folder the user has not allowed) gets its own
 * code so the picker can say so and name where to allow it; a missing path stays the 404 it
 * always was.
 */
export function dirReadError(err: unknown, dir: string): HttpError {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code === "EACCES" || code === "EPERM") {
    return new HttpError(
      403,
      "dir_permission_denied",
      `The server is not allowed to read this directory: ${dir}.`,
    );
  }
  if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") {
    return new HttpError(404, "dir_not_found", `Directory does not exist: ${dir}.`);
  }
  return new HttpError(500, "dir_read_failed", `Could not read this directory: ${dir}.`);
}

/**
 * Why a folder name cannot be made, or null when it can. A name is ONE segment: a separator
 * (either spelling — a name travels between machines), `.`/`..`, or the empty string would
 * either escape the folder on screen or name nothing, and a NUL is not a path at all. What is
 * left is checked by the filesystem, not here: a name the platform dislikes (`*` on Windows)
 * comes back as a create error, not as this route's own opinion.
 */
export function dirNameError(name: string): HttpError | null {
  if (name === "") {
    return new HttpError(400, "dir_name_empty", "Enter a folder name.");
  }
  if (name === "." || name === ".." || /[\\/]/.test(name) || name.includes("\0")) {
    return new HttpError(400, "dir_name_invalid", "A folder name cannot be a path, `.` or `..`.");
  }
  return null;
}

/**
 * The HTTP answer for a `mkdir` that failed. "Already there" is its own code so the picker can
 * say the name is taken and keep the box open with what was typed; a name the platform refuses
 * (a reserved one, a character its filesystem will not hold) is a 400 rather than a 500, since
 * it is the input and not the server that is wrong.
 */
export function dirCreateError(err: unknown, target: string): HttpError {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code === "EEXIST") {
    return new HttpError(409, "dir_exists", `Something is already there: ${target}.`);
  }
  if (code === "EACCES" || code === "EPERM") {
    return new HttpError(
      403,
      "dir_permission_denied",
      `The server is not allowed to write here: ${path.dirname(target)}.`,
    );
  }
  if (code === "ENOENT" || code === "ENOTDIR") {
    return new HttpError(
      404,
      "dir_not_found",
      `Directory does not exist: ${path.dirname(target)}.`,
    );
  }
  if (code === "EINVAL" || code === "ENAMETOOLONG") {
    return new HttpError(400, "dir_name_invalid", `That folder name cannot be used: ${target}.`);
  }
  return new HttpError(500, "dir_create_failed", `Could not create this folder: ${target}.`);
}

/**
 * The HTTP answer for a `rmdir` (or the emptiness check before it) that failed on `dir`. The
 * same shape as `dirCreateError`; the one refusal a removal has of its own is a folder that
 * still holds something, which is a 409 with its own code because the user's next step differs
 * (empty it, or delete nothing at all) — never a retry of the same request.
 */
export function dirDeleteError(err: unknown, target: string): HttpError {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code === "ENOTEMPTY" || code === "EEXIST") {
    return new HttpError(409, "dir_not_empty", `The folder is not empty: ${target}.`);
  }
  if (code === "EACCES" || code === "EPERM") {
    return new HttpError(
      403,
      "dir_permission_denied",
      `The server is not allowed to write here: ${path.dirname(target)}.`,
    );
  }
  if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") {
    return new HttpError(404, "dir_not_found", `Directory does not exist: ${target}.`);
  }
  return new HttpError(500, "dir_delete_failed", `Could not delete this folder: ${target}.`);
}

/**
 * Whether `above` is `below` itself or one of the folders holding it — what the Project
 * directory's protection is made of. Both sides are resolved first, so a trailing separator,
 * a `.`/`..` in the middle and a doubled separator all compare as the folder they name.
 */
export function isSameOrAbove(above: string, below: string): boolean {
  const a = path.resolve(above);
  const b = path.resolve(below);
  return a === b || b.startsWith(a.endsWith(path.sep) ? a : `${a}${path.sep}`);
}

/**
 * The Project's own directory, resolved where it exists. The data root itself may be reached
 * through a symlink (`/tmp` and `/var` are on macOS, and an operator may point `ADELIE_HOME`
 * at one), so comparing a caller's path against the spelling `<root>/<projectId>` alone would
 * mistake a link to that folder for somewhere else.
 */
async function resolveProjectDir(root: string, projectId: string): Promise<string> {
  const dir = projectDir(root, projectId);
  try {
    return await fs.realpath(dir);
  } catch {
    return path.resolve(dir);
  }
}

/**
 * `requireProjectDir` with the refusal told apart from absence. That helper folds every
 * failure into "does not exist or is inaccessible", which is the right answer where a path is
 * being validated; here it is the question being asked.
 */
async function resolveBrowsableDir(target: string): Promise<string> {
  if (!path.isAbsolute(target)) {
    throw new HttpError(400, "dir_not_absolute", "Directory must be an absolute path.");
  }
  let real: string;
  let isDir: boolean;
  try {
    real = await fs.realpath(target);
    isDir = (await fs.stat(real)).isDirectory();
  } catch (err) {
    throw dirReadError(err, target);
  }
  if (!isDir) throw new HttpError(400, "not_a_dir", "Not a directory.");
  return real;
}

/**
 * Past this many entries only the dirent is read: a stat per entry is what gives a symlink
 * its target's kind and every row its time, and a folder of tens of thousands of files would
 * otherwise hold the listing for seconds. Beyond it, a symlink to a folder reads as a file.
 */
const STAT_LIMIT = 5000;

/**
 * Kind and modification time for each entry. stat follows symlinks, so a link to a folder is
 * browsable like one; an entry stat cannot reach (a dangling link, a refused one) keeps the
 * dirent's kind and no time rather than failing the whole folder.
 */
async function describeEntries(
  dir: string,
  dirents: import("node:fs").Dirent[],
): Promise<DirEntryInfo[]> {
  return Promise.all(
    dirents.map(async (d, index): Promise<DirEntryInfo> => {
      const full = path.join(dir, d.name);
      let isDir = d.isDirectory();
      let mtime: number | undefined;
      if (index < STAT_LIMIT) {
        try {
          const st = await fs.stat(full);
          isDir = st.isDirectory();
          mtime = Math.round(st.mtimeMs);
        } catch {
          // Keep the dirent's answer.
        }
      }
      return {
        name: d.name,
        path: full,
        kind: isDir ? "dir" : "file",
        ...(mtime !== undefined ? { mtime } : {}),
      };
    }),
  );
}

/** The drive roots that exist on a Windows host (`C:\`, …), for the picker's sidebar. */
async function driveRoots(): Promise<string[]> {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const found = await Promise.all(
    letters.map((letter) =>
      fs.access(`${letter}:\\`).then(
        () => `${letter}:\\`,
        () => null,
      ),
    ),
  );
  return found.filter((root): root is string => root !== null);
}

/** The Project-scoped directory routes; the repos and the access check are components of their own. */
@Component({
  contributes: {
    "HttpModule.routes": [
      {
        id: "projects.dirs",
        prefix: "/api/projects/:projectId/dirs",
        auth: "user",
        order: 150,
      },
      {
        id: "projects.dir-skills",
        prefix: "/api/projects/:projectId/dir-skills",
        auth: "user",
        order: 160,
      },
    ],
  },
})
export class ProjectsRoutes {
  @Use() private readonly access!: Access;
  @Use() private readonly desktop!: Desktop;
  @Use() private readonly paths!: Paths;
  @Bind("projects.dirs") dirsRoutes!: Hono<AppEnv>;
  @Bind("projects.dir-skills") dirSkillsRoutes!: Hono<AppEnv>;
  setup() {
    this.dirsRoutes = dirsRoutes({
      access: this.access,
      root: this.paths.root,
      desktop: this.desktop.current(),
    });
    this.dirSkillsRoutes = directorySkillsRoutes({ access: this.access });
  }
}
