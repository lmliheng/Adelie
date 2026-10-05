/**
 * The directory browser behind the Workspace picker: folders and files come back with their
 * kind and modification time, and a folder the service may not read is a distinguishable
 * error rather than an empty listing — on macOS an unanswered privacy prompt looks exactly
 * like that, and an empty list hid it.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  DirCreateResponse,
  DirDeleteResponse,
  DirListResponse,
  ProjectCreateResponse,
} from "../src/api/types.js";
import { dirReadError, isSameOrAbove } from "../src/http/routes/dirs.js";
import { apiClient, canCreateSymlink, createTestApp, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

const errno = (code: string) => Object.assign(new Error(code), { code });

describe("dirReadError", () => {
  it("gives a refusal its own code, whichever errno the OS used for it", () => {
    for (const code of ["EACCES", "EPERM"]) {
      const err = dirReadError(errno(code), "/Users/me/Downloads/x");
      expect([err.status, err.code]).toEqual([403, "dir_permission_denied"]);
    }
  });

  it("keeps absence a 404", () => {
    const err = dirReadError(errno("ENOENT"), "/gone");
    expect([err.status, err.code]).toEqual([404, "dir_not_found"]);
  });
});

describe("dirs api", () => {
  let t: TestApp;
  let owner: ReturnType<typeof apiClient>;
  let projectId: string;
  let dir: string;

  const listUrl = (p: string) => `/api/projects/${projectId}/dirs?path=${encodeURIComponent(p)}`;

  beforeEach(async () => {
    t = await createTestApp();
    const a = await provisionUser(t.app, "owner_dirs");
    owner = apiClient(t.app, a.cookie);
    const created = (await (
      await owner.post("/api/projects", { projectId: "owner_dirs-browse", name: "dirs project" })
    ).json()) as ProjectCreateResponse;
    projectId = created.project.projectId;
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "penguin-dirs-")));
  });

  afterEach(async () => {
    try {
      await fs.chmod(path.join(dir, "locked"), 0o755).catch(() => undefined);
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } finally {
      await t.cleanup();
    }
  });

  it("lists folders and files with their kind and modification time", async () => {
    await fs.mkdir(path.join(dir, "src"));
    await fs.writeFile(path.join(dir, "notes.txt"), "x");
    const res = await owner.get(listUrl(dir));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DirListResponse;
    expect(body.path).toBe(dir);
    expect(body.platform).toBe(process.platform);
    expect(body.entries.map((e) => [e.name, e.kind])).toEqual([
      ["notes.txt", "file"],
      ["src", "dir"],
    ]);
    expect(body.entries.every((e) => typeof e.mtime === "number")).toBe(true);
  });

  // POSIX permission bits: meaningless on win32, and root reads through them.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "answers a folder it may not read with dir_permission_denied, not an empty list",
    async () => {
      const locked = path.join(dir, "locked");
      await fs.mkdir(locked);
      await fs.writeFile(path.join(locked, "inside.txt"), "x");
      await fs.chmod(locked, 0o000);
      const res = await owner.get(listUrl(locked));
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "dir_permission_denied",
      );
    },
  );
});

describe("dir create api", () => {
  let t: TestApp;
  let owner: ReturnType<typeof apiClient>;
  let projectId: string;
  let dir: string;

  const createUrl = () => `/api/projects/${projectId}/dirs`;
  const listUrl = (p: string) => `${createUrl()}?path=${encodeURIComponent(p)}`;
  const create = (parent: unknown, name: unknown) => owner.post(createUrl(), { parent, name });

  beforeEach(async () => {
    t = await createTestApp();
    const a = await provisionUser(t.app, "owner_mkdir");
    owner = apiClient(t.app, a.cookie);
    const created = (await (
      await owner.post("/api/projects", { projectId: "owner_mkdir-dirs", name: "mkdir project" })
    ).json()) as ProjectCreateResponse;
    projectId = created.project.projectId;
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "penguin-mkdir-")));
  });

  afterEach(async () => {
    await t.cleanup();
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  it("makes one folder and answers with its path", async () => {
    const res = await create(dir, "notes");
    expect(res.status).toBe(201);
    expect(((await res.json()) as DirCreateResponse).path).toBe(path.join(dir, "notes"));
    expect((await fs.stat(path.join(dir, "notes"))).isDirectory()).toBe(true);
    // Visible to the picker straight away, since that is what the answer is for.
    const listing = (await (await owner.get(listUrl(dir))).json()) as DirListResponse;
    expect(listing.entries.map((e) => e.name)).toContain("notes");
  });

  it("refuses a name that is a path, `.`, `..` or empty, without touching the disk", async () => {
    for (const [name, code] of [
      ["a/b", "dir_name_invalid"],
      ["a\\b", "dir_name_invalid"],
      ["..", "dir_name_invalid"],
      [".", "dir_name_invalid"],
      ["", "dir_name_empty"],
    ] as const) {
      const res = await create(dir, name);
      expect([res.status, ((await res.json()) as { error: { code: string } }).error.code]).toEqual([
        400,
        code,
      ]);
    }
    // Nothing was made: a rejected name never reaches the filesystem as a path.
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("keeps a name already taken a 409, and a parent that is not there a 404", async () => {
    await fs.mkdir(path.join(dir, "taken"));
    expect((await create(dir, "taken")).status).toBe(409);
    expect((await create(path.join(dir, "gone"), "child")).status).toBe(404);
  });

  it("needs an absolute parent", async () => {
    expect((await create("relative", "child")).status).toBe(400);
  });

  it("is refused to a caller who may not see the Project", async () => {
    const stranger = await provisionUser(t.app, "stranger_mkdir");
    const res = await apiClient(t.app, stranger.cookie).post(createUrl(), {
      parent: dir,
      name: "nope",
    });
    // The Project does not exist for this caller, so the route is not theirs to reach.
    expect([403, 404]).toContain(res.status);
    expect(await fs.readdir(dir)).toEqual([]);
  });
});

describe("isSameOrAbove", () => {
  it("reads a folder and every folder holding it as the same answer", () => {
    expect(isSameOrAbove("/srv/app", "/srv/app")).toBe(true);
    expect(isSameOrAbove("/srv/app", "/srv/app/sub")).toBe(true);
    expect(isSameOrAbove("/srv/app/", "/srv/app/sub/")).toBe(true);
  });

  it("keeps a sibling and a child apart from its parent", () => {
    expect(isSameOrAbove("/srv/app", "/srv/app-old")).toBe(false);
    expect(isSameOrAbove("/srv/app", "/srv")).toBe(false);
    expect(isSameOrAbove("/srv/app", "/other/app")).toBe(false);
  });
});

describe("dir delete api", () => {
  let t: TestApp;
  let owner: ReturnType<typeof apiClient>;
  let projectId: string;
  let projectDir: string;
  let dir: string;

  const deleteUrl = () => `/api/projects/${projectId}/dirs`;
  const listUrl = (p: string) => `${deleteUrl()}?path=${encodeURIComponent(p)}`;
  const remove = (p: unknown) => owner.delete(deleteUrl(), { path: p });
  const codeOf = async (res: Response) =>
    ((await res.json()) as { error: { code: string } }).error.code;

  beforeEach(async () => {
    t = await createTestApp();
    const a = await provisionUser(t.app, "owner_rmdir");
    owner = apiClient(t.app, a.cookie);
    const created = (await (
      await owner.post("/api/projects", { projectId: "owner_rmdir-dirs", name: "rmdir project" })
    ).json()) as ProjectCreateResponse;
    projectId = created.project.projectId;
    projectDir = path.join(t.root, projectId);
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "penguin-rmdir-")));
  });

  afterEach(async () => {
    await t.cleanup();
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  it("removes one empty folder and answers with its path", async () => {
    await fs.mkdir(path.join(dir, "gone"));
    const res = await remove(path.join(dir, "gone"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as DirDeleteResponse).path).toBe(path.join(dir, "gone"));
    await expect(fs.stat(path.join(dir, "gone"))).rejects.toMatchObject({ code: "ENOENT" });
    // Gone from the picker's next listing too, since that is where the row was.
    const listing = (await (await owner.get(listUrl(dir))).json()) as DirListResponse;
    expect(listing.entries.map((e) => e.name)).not.toContain("gone");
  });

  it("refuses a folder that is not empty, and leaves it whole", async () => {
    await fs.mkdir(path.join(dir, "full"));
    await fs.writeFile(path.join(dir, "full", "notes.txt"), "x");
    await fs.mkdir(path.join(dir, "full", "sub"));
    const res = await remove(path.join(dir, "full"));
    expect([res.status, await codeOf(res)]).toEqual([409, "dir_not_empty"]);
    // Not one entry was touched: there is no recursive delete behind this.
    expect((await fs.readdir(path.join(dir, "full"))).sort()).toEqual(["notes.txt", "sub"]);
  });

  it("needs an absolute path", async () => {
    for (const bad of ["relative", "", undefined]) {
      expect((await remove(bad)).status).toBe(400);
    }
    expect(await codeOf(await remove("relative"))).toBe("dir_not_absolute");
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("refuses a file: this route removes folders", async () => {
    await fs.writeFile(path.join(dir, "notes.txt"), "x");
    const res = await remove(path.join(dir, "notes.txt"));
    expect([res.status, await codeOf(res)]).toEqual([400, "not_a_dir"]);
    expect((await fs.stat(path.join(dir, "notes.txt"))).isFile()).toBe(true);
  });

  it("refuses the root", async () => {
    const res = await remove("/");
    expect([res.status, await codeOf(res)]).toEqual([403, "dir_root_protected"]);
    expect((await fs.stat("/")).isDirectory()).toBe(true);
  });

  it("refuses the Project's own directory and anything above it", async () => {
    for (const forbidden of [projectDir, t.root]) {
      const res = await remove(forbidden);
      expect([res.status, await codeOf(res)]).toEqual([403, "dir_project_protected"]);
      expect((await fs.stat(forbidden)).isDirectory()).toBe(true);
    }
  });

  it("cannot be talked into the Project's directory through a symlink", async () => {
    if (!canCreateSymlink()) return;
    const link = path.join(dir, "shortcut");
    await fs.symlink(projectDir, link, "dir");
    const res = await remove(link);
    expect([res.status, await codeOf(res)]).toEqual([403, "dir_project_protected"]);
    expect((await fs.stat(projectDir)).isDirectory()).toBe(true);
  });

  it("keeps a folder that is already gone a 404", async () => {
    const res = await remove(path.join(dir, "never"));
    expect([res.status, await codeOf(res)]).toEqual([404, "dir_not_found"]);
  });

  it("is refused to a caller who may not see the Project", async () => {
    await fs.mkdir(path.join(dir, "keep"));
    const stranger = await provisionUser(t.app, "stranger_rmdir");
    const res = await apiClient(t.app, stranger.cookie).delete(deleteUrl(), {
      path: path.join(dir, "keep"),
    });
    expect([403, 404]).toContain(res.status);
    expect((await fs.stat(path.join(dir, "keep"))).isDirectory()).toBe(true);
  });
});
