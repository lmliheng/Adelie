/**
 * Workspaces the user added by hand (lib/workspace-registry.ts): kept per Project in
 * localStorage and merged into the sidebar's Workspace grouping as groups of their own.
 *
 * - A picked path is normalized (trimmed, trailing separators dropped, a root or a Windows
 *   drive root kept whole), so it dedups against the paths Sessions report.
 * - Registering prepends the pick; an already registered path, a blank one or a temporary
 *   Workspace changes nothing (the same array comes back). The machine a directory was picked
 *   on is recorded, and the same path on two machines is two Workspaces. A HIDDEN entry is the
 *   one exception: picking that directory again clears the stamp (that is the way back on the
 *   list) and keeps the alias.
 * - Hiding stamps one machine's pair — alias and all — and stamps an unregistered path too (a
 *   group the server derives from Sessions has no entry of its own until then); a blank path,
 *   a blank instant or a temporary Workspace is refused.
 * - An alias is trimmed, a blank one reverts to the basename, the input is never mutated, and
 *   an unchanged alias changes nothing; renaming one machine's entry leaves the other's alone.
 * - Entries round-trip per Project (alias and machine included); nothing stored or no Project
 *   is empty and reading writes nothing; the older string-only shape still loads.
 * - Malformed values, junk elements, junk aliases and empty machine ids are dropped; a storage
 *   that throws degrades instead of escaping.
 * - Merged into the groups, empty registered groups follow the session-backed ones, an alias
 *   relabels a session-backed group too, a temporary path never forms a group, and each
 *   machine gets its own group.
 * - Dropping the hidden ones takes a session-backed group off the list as long as every chat
 *   in it predates the removal — and gives it back the moment one was CREATED after it, so a
 *   live conversation can never be invisible. Per machine, like everything else here.
 */
import { describe, expect, it } from "vitest";
import {
  dropHiddenWorkspaces,
  hideWorkspace,
  loadWorkspaceRegistry,
  mergeRegisteredWorkspaces,
  normalizeWorkspacePath,
  registerWorkspace,
  saveWorkspaceRegistry,
  setWorkspaceAlias,
  workspaceRegistryKey,
} from "../src/lib/workspace-registry";
import type { WorkspaceEntry, WorkspaceRegistryStorage } from "../src/lib/workspace-registry";
import { TEMP_WORKSPACE_GROUP_KEY } from "../src/lib/session-grouping";
import type { WorkspaceGroup } from "../src/lib/session-grouping";
import { blockedStorage, memoryStorage } from "./helpers/storage";

/** Minimal session-derived group (only the fields the merge reads matter). */
function group<T = { id: string }>(key: string, over: Partial<WorkspaceGroup<T>> = {}) {
  return {
    key,
    label: key.split("/").filter(Boolean).pop() ?? "/",
    fullPath: key,
    machineId: null as string | null,
    temp: false,
    sessions: [] as T[],
    ...over,
  };
}

/** A chat row as dropHiddenWorkspaces reads one: an id plus the instant it was created. */
type Chat = { id: string; createdAt: string };
const chat = (id: string, createdAt: string): Chat => ({ id, createdAt });

describe("normalizeWorkspacePath", () => {
  it("trims and drops trailing separators; the filesystem root survives; empty stays empty", () => {
    expect(normalizeWorkspacePath("  /srv/app/  ")).toBe("/srv/app");
    expect(normalizeWorkspacePath("/srv/app///")).toBe("/srv/app");
    expect(normalizeWorkspacePath("C:\\work\\repo\\")).toBe("C:\\work\\repo");
    expect(normalizeWorkspacePath("/")).toBe("/");
    expect(normalizeWorkspacePath("   ")).toBe("");
  });

  it("a win32 DRIVE root keeps its separator (stripping it would make the path drive-relative)", () => {
    // `C:` resolves against the drive's current directory, so the registry would hold a
    // different location than the user picked — and never dedup with Sessions keyed `C:\`.
    expect(normalizeWorkspacePath("C:\\")).toBe("C:\\");
    expect(normalizeWorkspacePath("c:/")).toBe("c:/");
    expect(normalizeWorkspacePath("  D:\\  ")).toBe("D:\\");
    // Deeper win32 paths still lose their trailing separator.
    expect(normalizeWorkspacePath("C:\\work\\")).toBe("C:\\work");
  });
});

describe("registerWorkspace / hideWorkspace", () => {
  it("register prepends the normalized pick (newest first) and dedups by normalized form with a same-reference fast exit", () => {
    const empty: readonly WorkspaceEntry[] = [];
    const one = registerWorkspace(empty, "/srv/app/");
    expect(one).toEqual([{ path: "/srv/app" }]);
    const two = registerWorkspace(one, "/srv/beta");
    expect(two.map((e) => e.path)).toEqual(["/srv/beta", "/srv/app"]);
    // Already registered (under a trailing-separator variant) or empty: the INPUT array returns.
    expect(registerWorkspace(two, "/srv/app///")).toBe(two);
    expect(registerWorkspace(two, "   ")).toBe(two);
  });

  it("rejects a temporary-workspace path: the merge can never group it, so an entry would be an unremovable ghost", () => {
    const entries: readonly WorkspaceEntry[] = [];
    const temp = "/home/u/.penguin/agents/a/workspaces/tmp-0123abcd";
    expect(registerWorkspace(entries, temp)).toBe(entries);
    expect(registerWorkspace(entries, `${temp}/`)).toBe(entries);
  });

  it("picking a HIDDEN directory again takes it back onto the list: the stamp goes, the alias stays", () => {
    const entries: readonly WorkspaceEntry[] = [
      { path: "/a", alias: "Alpha", hiddenAt: "2026-10-06T10:00:00.000Z" },
      { path: "/b" },
    ];
    expect(registerWorkspace(entries, "/a")).toEqual([
      { path: "/a", alias: "Alpha" },
      { path: "/b" },
    ]);
    // The machine travels with the pair: unhiding this machine's entry leaves the remote one hidden.
    const both: readonly WorkspaceEntry[] = [
      { path: "/a", hiddenAt: "2026-10-06T10:00:00.000Z" },
      { path: "/a", machineId: "noeSE0FFHhNXl2J5", hiddenAt: "2026-10-06T10:00:00.000Z" },
    ];
    expect(registerWorkspace(both, "/a").map((e) => e.machineId)).toEqual([
      undefined,
      "noeSE0FFHhNXl2J5",
    ]);
  });
});

describe("hideWorkspace", () => {
  const at = "2026-10-06T10:00:00.000Z";

  it("stamps the pair — alias kept — and stamps an unregistered path too (a session-derived group has no entry yet)", () => {
    const entries: readonly WorkspaceEntry[] = [{ path: "/a", alias: "Alpha" }, { path: "/b" }];
    expect(hideWorkspace(entries, "/a", null, at)).toEqual([
      { path: "/a", alias: "Alpha", hiddenAt: at },
      { path: "/b" },
    ]);
    expect(hideWorkspace(entries, "/zzz", null, at)).toEqual([
      { path: "/zzz", hiddenAt: at },
      { path: "/a", alias: "Alpha" },
      { path: "/b" },
    ]);
    // Re-hiding under a new instant rewrites the stamp; the very same instant is a no-op.
    const hidden = hideWorkspace(entries, "/a", null, at);
    expect(hideWorkspace(hidden, "/a", null, "2026-10-06T11:00:00.000Z")).not.toBe(hidden);
    expect(hideWorkspace(hidden, "/a", null, at)).toBe(hidden);
  });

  it("refuses a blank path, a blank instant and a temporary Workspace (same array back)", () => {
    const entries: readonly WorkspaceEntry[] = [{ path: "/a" }];
    expect(hideWorkspace(entries, "   ", null, at)).toBe(entries);
    expect(hideWorkspace(entries, "/a", null, "  ")).toBe(entries);
    const temp = "/home/u/.penguin/agents/a/workspaces/tmp-0123abcd";
    expect(hideWorkspace(entries, temp, null, at)).toBe(entries);
  });
});

describe("setWorkspaceAlias", () => {
  const entries: readonly WorkspaceEntry[] = [{ path: "/a" }, { path: "/b" }];

  it("sets a trimmed alias, clears it on blank (revert to basename), and never mutates the input", () => {
    const named = setWorkspaceAlias(entries, "/a", null, "  My App  ");
    expect(named).toEqual([{ path: "/a", alias: "My App" }, { path: "/b" }]);
    expect(entries[0]).toEqual({ path: "/a" }); // input untouched (React state discipline)
    expect(setWorkspaceAlias(named, "/a", null, "   ")).toEqual([{ path: "/a" }, { path: "/b" }]);
  });

  it("same-reference fast exit: unknown path, unchanged alias, or clearing an alias that isn't set", () => {
    expect(setWorkspaceAlias(entries, "/zzz", null, "X")).toBe(entries);
    expect(setWorkspaceAlias(entries, "/a", null, "")).toBe(entries);
    const named = setWorkspaceAlias(entries, "/a", null, "X");
    expect(setWorkspaceAlias(named, "/a", null, " X ")).toBe(named);
  });

  it("renaming a group the user had removed keeps it removed (the hidden stamp survives the rewrite)", () => {
    const hidden: readonly WorkspaceEntry[] = [
      { path: "/a", alias: "Alpha", hiddenAt: "2026-10-06T10:00:00.000Z" },
    ];
    expect(setWorkspaceAlias(hidden, "/a", null, "Beta")).toEqual([
      { path: "/a", alias: "Beta", hiddenAt: "2026-10-06T10:00:00.000Z" },
    ]);
  });
});

describe("persisted registry (per-Project localStorage)", () => {
  it("round-trips entries (alias and machine included) per Project; nothing stored / no Project is empty; reading never writes", () => {
    const s = memoryStorage();
    expect(loadWorkspaceRegistry("p1", s)).toEqual([]);
    expect(loadWorkspaceRegistry(null, s)).toEqual([]);
    expect(s.map.size).toBe(0);
    saveWorkspaceRegistry(null, [{ path: "/x" }], s);
    expect(s.map.size).toBe(0);
    saveWorkspaceRegistry(
      "p1",
      [
        { path: "/srv/beta", alias: "Beta" },
        { path: "/srv/app", machineId: "noeSE0FFHhNXl2J5" },
        { path: "/srv/gone", hiddenAt: "2026-10-06T10:00:00.000Z" },
      ],
      s,
    );
    saveWorkspaceRegistry("p2", [{ path: "/other" }], s);
    expect(loadWorkspaceRegistry("p1", s)).toEqual([
      { path: "/srv/beta", alias: "Beta" },
      { path: "/srv/app", machineId: "noeSE0FFHhNXl2J5" },
      { path: "/srv/gone", hiddenAt: "2026-10-06T10:00:00.000Z" },
    ]);
    expect(loadWorkspaceRegistry("p2", s)).toEqual([{ path: "/other" }]);
  });

  it("still loads the branch's earlier string-only shape, mixed with entry objects", () => {
    const s = memoryStorage();
    s.map.set(
      workspaceRegistryKey("p1"),
      '["/old/one/", {"path": "/new/two", "alias": " Two "}, "/old/one"]',
    );
    expect(loadWorkspaceRegistry("p1", s)).toEqual([
      { path: "/old/one" },
      { path: "/new/two", alias: "Two" },
    ]);
  });

  it("malformed values degrade to empty; junk elements and junk aliases are dropped", () => {
    const s = memoryStorage();
    for (const raw of ["{not json", '"x"', "42", "null", "{}", ""]) {
      s.map.set(workspaceRegistryKey("p1"), raw);
      expect(loadWorkspaceRegistry("p1", s)).toEqual([]);
    }
    s.map.set(
      workspaceRegistryKey("p1"),
      '[7, null, "  ", {"alias": "orphan"}, {"path": "/a", "alias": 5}, {"path": "/b", "alias": "  "}]',
    );
    expect(loadWorkspaceRegistry("p1", s)).toEqual([{ path: "/a" }, { path: "/b" }]);
    // A junk hidden stamp is dropped rather than carried: it can only HIDE, and an instant we
    // cannot read must not take a group off the list for good.
    s.map.set(
      workspaceRegistryKey("p1"),
      '[{"path": "/a", "hiddenAt": 7}, {"path": "/b", "hiddenAt": "  "}, {"path": "/c", "hiddenAt": " 2026-10-06T10:00:00.000Z "}]',
    );
    expect(loadWorkspaceRegistry("p1", s)).toEqual([
      { path: "/a" },
      { path: "/b" },
      { path: "/c", hiddenAt: "2026-10-06T10:00:00.000Z" },
    ]);
  });

  it("storage throwing (quota/private mode): save does not throw, load yields empty", () => {
    const broken = blockedStorage();
    expect(() => saveWorkspaceRegistry("p1", [{ path: "/x" }], broken)).not.toThrow();
    expect(loadWorkspaceRegistry("p1", broken)).toEqual([]);
  });

  it("storage whose GETTER throws (blocked site data) degrades instead of escaping the useState initializer", () => {
    const hostile = {
      get getItem(): never {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
    } as unknown as WorkspaceRegistryStorage;
    expect(() => loadWorkspaceRegistry("p1", hostile)).not.toThrow();
    expect(loadWorkspaceRegistry("p1", hostile)).toEqual([]);
  });
});

describe("mergeRegisteredWorkspaces", () => {
  it("empty registered groups sort AFTER the session-backed ones, so real conversations keep the first page", () => {
    // Fronting them pushed every group holding chats onto a later page of the sidebar's
    // 10-group pagination as soon as a few Workspaces were registered.
    const groups = [group("/srv/app", { sessions: [{ id: "s1" }] }), group("/srv/beta")];
    const merged = mergeRegisteredWorkspaces(groups, [
      { path: "/new/ws", alias: "Fancy" },
      { path: "/srv/app" },
      { path: "/another" },
    ]);
    expect(merged.map((g) => g.key)).toEqual(["/srv/app", "/srv/beta", "/new/ws", "/another"]);
    // Session-derived groups pass through untouched (same members, same order) …
    expect(merged[0]!.sessions).toEqual([{ id: "s1" }]);
    // … and the registered-only ones follow in registration order, labelled alias ?? basename.
    expect(merged[2]).toMatchObject({ label: "Fancy", fullPath: "/new/ws", temp: false });
    expect(merged[2]!.sessions).toEqual([]);
    expect(merged[3]!.label).toBe("another");
  });

  it("an alias relabels a session-backed group too (the entry dedups away but its name wins)", () => {
    const groups = [group("/srv/app", { sessions: [{ id: "s1" }] })];
    const merged = mergeRegisteredWorkspaces(groups, [{ path: "/srv/app", alias: "Prod" }]);
    expect(merged.map((g) => g.key)).toEqual(["/srv/app"]);
    expect(merged[0]!.label).toBe("Prod");
    expect(merged[0]!.fullPath).toBe("/srv/app"); // tooltip keeps the full path
  });

  it("temp-shaped registered paths never form a group (the merged temp group owns that space); no registrations = groups pass through", () => {
    const tempPath = "/home/u/.penguin/agents/a/workspaces/tmp-0123abcd";
    const groups = [group(TEMP_WORKSPACE_GROUP_KEY, { temp: true, fullPath: null, label: "" })];
    expect(mergeRegisteredWorkspaces(groups, [{ path: tempPath }]).map((g) => g.key)).toEqual([
      TEMP_WORKSPACE_GROUP_KEY,
    ]);
    expect(mergeRegisteredWorkspaces(groups, []).map((g) => g.key)).toEqual([
      TEMP_WORKSPACE_GROUP_KEY,
    ]);
  });
});

describe("a workspace's machine", () => {
  it("records the machine a directory was picked on, and none for this machine (as older entries read)", () => {
    const entries = registerWorkspace([], "/srv/app", "noeSE0FFHhNXl2J5");
    expect(entries[0]).toEqual({ path: "/srv/app", machineId: "noeSE0FFHhNXl2J5" });
    expect(registerWorkspace([], "/srv/app")[0]).toEqual({ path: "/srv/app" });
  });

  it("keeps the same path on two machines as two workspaces", () => {
    // `/srv/app` on two machines is two different directories; collapsing them would hide
    // one behind the other with no way to tell which.
    let entries = registerWorkspace([], "/srv/app", "noeSE0FFHhNXl2J5");
    entries = registerWorkspace(entries, "/srv/app");
    entries = registerWorkspace(entries, "/srv/app", "OTHERaaaaaaaaaaa");
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.machineId)).toEqual([
      "OTHERaaaaaaaaaaa",
      undefined,
      "noeSE0FFHhNXl2J5",
    ]);
  });

  it("still dedups the same path on the SAME machine", () => {
    const first = registerWorkspace([], "/srv/app", "noeSE0FFHhNXl2J5");
    expect(registerWorkspace(first, "/srv/app", "noeSE0FFHhNXl2J5")).toBe(first);
    const local = registerWorkspace([], "/srv/app");
    expect(registerWorkspace(local, "/srv/app")).toBe(local);
  });

  it("drops an empty machine id rather than storing a workspace on nothing", () => {
    const storage = memoryStorage({
      [workspaceRegistryKey("p")]: JSON.stringify([{ path: "/a", machineId: "" }]),
    });
    expect(loadWorkspaceRegistry("p", storage)).toEqual([{ path: "/a" }]);
  });

  it("loads both machines' entries for one path (a path-only dedup here lost one for good)", () => {
    const storage = memoryStorage({
      [workspaceRegistryKey("p")]: JSON.stringify([
        { path: "/srv/app", machineId: "noeSE0FFHhNXl2J5" },
        { path: "/srv/app" },
      ]),
    });
    expect(loadWorkspaceRegistry("p", storage)).toEqual([
      { path: "/srv/app", machineId: "noeSE0FFHhNXl2J5" },
      { path: "/srv/app" },
    ]);
  });

  it("renames one machine's workspace, keeps its machine, and leaves the other machine's alone", () => {
    const entries: readonly WorkspaceEntry[] = [
      { path: "/srv/app", machineId: "noeSE0FFHhNXl2J5" },
      { path: "/srv/app" },
    ];
    expect(setWorkspaceAlias(entries, "/srv/app", "noeSE0FFHhNXl2J5", "Prod")).toEqual([
      { path: "/srv/app", alias: "Prod", machineId: "noeSE0FFHhNXl2J5" },
      { path: "/srv/app" },
    ]);
    expect(setWorkspaceAlias(entries, "/srv/app", null, "Here")).toEqual([
      { path: "/srv/app", machineId: "noeSE0FFHhNXl2J5" },
      { path: "/srv/app", alias: "Here" },
    ]);
  });

  it("hides one machine's workspace, not the other entry sharing the path", () => {
    const entries: readonly WorkspaceEntry[] = [
      { path: "/srv/app", machineId: "noeSE0FFHhNXl2J5" },
      { path: "/srv/app" },
    ];
    expect(
      hideWorkspace(entries, "/srv/app", "noeSE0FFHhNXl2J5", "2026-10-06T10:00:00.000Z"),
    ).toEqual([
      { path: "/srv/app", machineId: "noeSE0FFHhNXl2J5", hiddenAt: "2026-10-06T10:00:00.000Z" },
      { path: "/srv/app" },
    ]);
    expect(hideWorkspace(entries, "/srv/app", null, "2026-10-06T10:00:00.000Z")).toEqual([
      { path: "/srv/app", hiddenAt: "2026-10-06T10:00:00.000Z" },
      { path: "/srv/app", machineId: "noeSE0FFHhNXl2J5" },
    ]);
  });

  it("merges one group per machine, and an alias relabels only its own", () => {
    const remote = "noeSE0FFHhNXl2J5";
    const groups = [
      group(`${remote}\u0000/srv/app`, {
        fullPath: "/srv/app",
        machineId: remote,
        label: "app",
        sessions: [{ id: "s1" }],
      }),
    ];
    const merged = mergeRegisteredWorkspaces(groups, [
      { path: "/srv/app", machineId: remote, alias: "Prod" },
      { path: "/srv/app" },
    ]);
    expect(merged.map((g) => g.key)).toEqual([`${remote}\u0000/srv/app`, "/srv/app"]);
    // The remote group keeps its Sessions and takes its own alias …
    expect(merged[0]).toMatchObject({ label: "Prod", machineId: remote });
    expect(merged[0]!.sessions).toEqual([{ id: "s1" }]);
    // … and this machine's entry becomes its own empty group, unaliased.
    expect(merged[1]).toMatchObject({ label: "app", machineId: null, fullPath: "/srv/app" });
    expect(merged[1]!.sessions).toEqual([]);
  });
});

describe("dropHiddenWorkspaces", () => {
  const at = "2026-10-06T10:00:00.000Z";
  const created = (s: Chat) => s.createdAt;

  it("takes a SESSION-BACKED group off the list — the case that used to survive 删除工作区", () => {
    const groups = [
      group<Chat>("/srv/app", { sessions: [chat("s1", "2026-10-06T09:00:00.000Z")] }),
      group<Chat>("/srv/beta", { sessions: [chat("s2", "2026-10-06T09:30:00.000Z")] }),
    ];
    const kept = dropHiddenWorkspaces(groups, [{ path: "/srv/app", hiddenAt: at }], created);
    expect(kept.map((g) => g.key)).toEqual(["/srv/beta"]);
    // The group itself is untouched: only the list drops it (disk and chats are never edited).
    expect(groups[0]!.sessions).toEqual([chat("s1", "2026-10-06T09:00:00.000Z")]);
  });

  it("a chat CREATED after the removal brings the group back — a live conversation is never invisible", () => {
    const groups = [
      group<Chat>("/srv/app", {
        sessions: [chat("s1", "2026-10-06T09:00:00.000Z"), chat("s2", "2026-10-06T10:00:01.000Z")],
      }),
    ];
    expect(dropHiddenWorkspaces(groups, [{ path: "/srv/app", hiddenAt: at }], created)).toBe(
      groups,
    );
  });

  it("drops the empty group the merge adds for a hidden entry (a Workspace with no Sessions)", () => {
    const groups = [group<Chat>("/srv/app"), group<Chat>("/srv/beta")];
    expect(dropHiddenWorkspaces(groups, [{ path: "/srv/app", hiddenAt: at }], created)).toEqual([
      groups[1],
    ]);
  });

  it("hides per pair: the same path on another machine is another Workspace and stays", () => {
    const remote = "noeSE0FFHhNXl2J5";
    const groups = [
      group<Chat>("/srv/app", { sessions: [chat("s1", "2026-10-06T09:00:00.000Z")] }),
      group<Chat>(`${remote}\u0000/srv/app`, {
        machineId: remote,
        sessions: [chat("s2", "2026-10-06T09:00:00.000Z")],
      }),
    ];
    const kept = dropHiddenWorkspaces(groups, [{ path: "/srv/app", hiddenAt: at }], created);
    expect(kept.map((g) => g.key)).toEqual([`${remote}\u0000/srv/app`]);
  });

  it("an unreadable or unparseable stamp hides nothing; with no hidden entry the INPUT array comes back", () => {
    const groups = [
      group<Chat>("/srv/app", { sessions: [chat("s1", "2026-10-06T09:00:00.000Z")] }),
    ];
    expect(dropHiddenWorkspaces(groups, [], created)).toBe(groups);
    expect(dropHiddenWorkspaces(groups, [{ path: "/srv/app" }], created)).toBe(groups);
    expect(
      dropHiddenWorkspaces(groups, [{ path: "/srv/app", hiddenAt: "not a date" }], created),
    ).toBe(groups);
    // A Session whose stamp the rule cannot read counts as older, never as "in use".
    const undated = [group<Chat>("/srv/app", { sessions: [{ id: "s1" } as unknown as Chat] })];
    expect(dropHiddenWorkspaces(undated, [{ path: "/srv/app", hiddenAt: at }], created)).toEqual(
      [],
    );
  });
});
