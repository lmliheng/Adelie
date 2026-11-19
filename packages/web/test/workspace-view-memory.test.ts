/**
 * The Files panel's place, kept per scope across a move between dock surfaces
 * (src/features/chat/workspace-view-memory.ts).
 *
 * A layout move remounts the panel's body on another surface, and the place the reader had walked
 * to — the file in the preview, the folders unfolded on the way to it, the directory the
 * breadcrumbs name, the rendered/source choice for the open file, and where the preview and the
 * tree were scrolled — went with the old mount: measured in the browser, crossing to the narrow
 * surface came back to the tree's root with nothing open and both boxes at the top. A remount is
 * not always a move, though: a tab closed and reopened, or a Session switched away from and back
 * to, brings the body back on the surface its place was left on, and those still start the panel
 * over. What this file pins is the record's own rules: one place per scope, restored only from
 * another surface, a place that is the panel's start kept as nothing at all, and a copy on the way
 * in and out so neither a caller's array nor its offsets can reach into what was remembered.
 */
import { describe, expect, it } from "vitest";

const place = (surface: "right" | "bottom" | "merged", selectedPath = "src/a.md") => ({
  surface,
  selectedPath,
  currentDir: "src",
  expanded: ["src"],
  reading: "rendered" as const,
  previewScroll: null,
  treeScroll: null,
});

describe("workspace view memory", () => {
  it("has nothing for a scope the panel has never been in", async () => {
    const { recallWorkspaceView } = await import("../src/features/chat/workspace-view-memory");
    expect(recallWorkspaceView("session:never-opened", "merged")).toBeNull();
  });

  it("hands the place back to a body on another surface", async () => {
    const { recallWorkspaceView, rememberWorkspaceView } =
      await import("../src/features/chat/workspace-view-memory");
    rememberWorkspaceView("session:kept", {
      surface: "right",
      selectedPath: "src/a.md",
      currentDir: "src",
      expanded: ["src", "src/deep"],
      reading: "rendered",
      previewScroll: null,
      treeScroll: null,
    });
    expect(recallWorkspaceView("session:kept", "merged")).toEqual({
      surface: "right",
      selectedPath: "src/a.md",
      currentDir: "src",
      expanded: ["src", "src/deep"],
      reading: "rendered",
      previewScroll: null,
      treeScroll: null,
    });
  });

  it("hands back nothing to a body on the surface the place was left on (a remount that is not a move)", async () => {
    const { recallWorkspaceView, rememberWorkspaceView } =
      await import("../src/features/chat/workspace-view-memory");
    // A tab closed and opened again, or a Session switched away from and back to: same surface,
    // and the panel starts over there as it always did (files-switch.spec pins the Session one).
    rememberWorkspaceView("session:same-surface", place("right"));
    expect(recallWorkspaceView("session:same-surface", "right")).toBeNull();
  });

  it("keeps one place per scope: a Session and a directory never see each other's", async () => {
    const { recallWorkspaceView, rememberWorkspaceView } =
      await import("../src/features/chat/workspace-view-memory");
    rememberWorkspaceView("session:one", place("right", "a.md"));
    rememberWorkspaceView("workspace:\0/root/project", {
      surface: "right",
      selectedPath: null,
      currentDir: "util",
      expanded: ["util"],
      reading: "rendered",
      previewScroll: null,
      treeScroll: null,
    });
    expect(recallWorkspaceView("session:one", "merged")?.selectedPath).toBe("a.md");
    expect(recallWorkspaceView("workspace:\0/root/project", "merged")?.currentDir).toBe("util");
  });

  it("drops a place that is exactly where the panel starts, rather than keeping 'nothing'", async () => {
    const { recallWorkspaceView, rememberWorkspaceView } =
      await import("../src/features/chat/workspace-view-memory");
    rememberWorkspaceView("session:walked-back", place("right"));
    // The reader went back to the panel's start — no file, the root, nothing unfolded, the
    // preview rendered and both boxes at the top.
    rememberWorkspaceView("session:walked-back", {
      surface: "right",
      selectedPath: null,
      currentDir: "",
      expanded: [],
      reading: "rendered",
      previewScroll: null,
      treeScroll: null,
    });
    expect(recallWorkspaceView("session:walked-back", "merged")).toBeNull();
  });

  it("remembers a place that holds only one of the three", async () => {
    const { recallWorkspaceView, rememberWorkspaceView } =
      await import("../src/features/chat/workspace-view-memory");
    // A folder clicked in the tree, nothing selected: still a place.
    rememberWorkspaceView("session:dir-only", {
      surface: "bottom",
      selectedPath: null,
      currentDir: "util",
      expanded: ["util"],
      reading: "rendered",
      previewScroll: null,
      treeScroll: null,
    });
    expect(recallWorkspaceView("session:dir-only", "merged")).toEqual({
      surface: "bottom",
      selectedPath: null,
      currentDir: "util",
      expanded: ["util"],
      reading: "rendered",
      previewScroll: null,
      treeScroll: null,
    });
  });

  it("remembers a scrolled tree with nothing open: halfway down the rows is a place too", async () => {
    const { recallWorkspaceView, rememberWorkspaceView } =
      await import("../src/features/chat/workspace-view-memory");
    rememberWorkspaceView("session:tree-scrolled", {
      surface: "right",
      selectedPath: null,
      currentDir: "",
      expanded: [],
      reading: "rendered",
      previewScroll: null,
      treeScroll: { top: 480, left: 0 },
    });
    expect(recallWorkspaceView("session:tree-scrolled", "merged")?.treeScroll).toEqual({
      top: 480,
      left: 0,
    });
  });

  it("brings the reader's reading of the file back with the file", async () => {
    const { recallWorkspaceView, rememberWorkspaceView } =
      await import("../src/features/chat/workspace-view-memory");
    rememberWorkspaceView("session:source-view", {
      surface: "right",
      selectedPath: "notes.md",
      currentDir: "",
      expanded: [],
      reading: "source",
      previewScroll: { top: 320, left: 0 },
      treeScroll: null,
    });
    expect(recallWorkspaceView("session:source-view", "merged")).toMatchObject({
      selectedPath: "notes.md",
      reading: "source",
      previewScroll: { top: 320, left: 0 },
    });
  });

  it("copies both ways: the caller's array cannot reach the record, nor the record the caller", async () => {
    const { recallWorkspaceView, rememberWorkspaceView } =
      await import("../src/features/chat/workspace-view-memory");
    const expanded = ["src"];
    const previewScroll = { top: 120, left: 0 };
    rememberWorkspaceView("session:copied", {
      surface: "right",
      selectedPath: "a.md",
      currentDir: "src",
      expanded,
      reading: "rendered",
      previewScroll,
      treeScroll: null,
    });
    expanded.push("src/later");
    previewScroll.top = 999;
    expect(recallWorkspaceView("session:copied", "merged")?.expanded).toEqual(["src"]);
    expect(recallWorkspaceView("session:copied", "merged")?.previewScroll).toEqual({
      top: 120,
      left: 0,
    });

    const recalled = recallWorkspaceView("session:copied", "merged");
    // The record's own array, asserted back into a mutable one: anything the caller does to this
    // copy must not reach what was remembered.
    (recalled?.expanded as string[]).push("src/elsewhere");
    (recalled?.previewScroll as { top: number }).top = 5;
    expect(recallWorkspaceView("session:copied", "merged")?.expanded).toEqual(["src"]);
    expect(recallWorkspaceView("session:copied", "merged")?.previewScroll).toEqual({
      top: 120,
      left: 0,
    });
  });
});
