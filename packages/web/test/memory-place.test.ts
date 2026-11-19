/**
 * The Memory panel's place, kept per conversation across a move between dock surfaces
 * (src/features/chat/memory-place.ts).
 *
 * A layout move remounts the panel's body on another surface, and the place the reader had walked
 * to — the level (the list, or one memory's text) and how far down it they had scrolled — went with
 * the old mount: measured in the browser, a memory being read came back to the list, and both levels
 * came back at their top. A remount is not always a move, though: a tab closed and reopened, or a
 * conversation switched away from and back to, brings the body back on the surface its place was
 * left on, and those still start the panel over. What this file pins is the record's own rules: one
 * place per conversation, restored only from another surface, a place that is the panel's start
 * kept as nothing at all, and a copy on the way in and out so no caller can reach into it.
 */
import { describe, expect, it } from "vitest";

const list = { kind: "list" as const };
const detail = (file: string, scopeKey = "user") => ({
  kind: "detail" as const,
  target:
    scopeKey === "user"
      ? { scope: "user" as const, file }
      : { scope: "workspace" as const, scopeKey, file },
});

describe("memory place", () => {
  it("has nothing for a conversation the panel has never been in", async () => {
    const { recallMemoryPlace } = await import("../src/features/chat/memory-place");
    expect(recallMemoryPlace("session:never-opened", "merged")).toBeNull();
  });

  it("hands the place back to a body on another surface", async () => {
    const { recallMemoryPlace, rememberMemoryPlace } =
      await import("../src/features/chat/memory-place");
    rememberMemoryPlace("session:kept", {
      surface: "right",
      mode: detail("a.md"),
      listScroll: 0,
      detailScroll: 600,
    });
    expect(recallMemoryPlace("session:kept", "merged")).toEqual({
      surface: "right",
      mode: { kind: "detail", target: { scope: "user", file: "a.md" } },
      listScroll: 0,
      detailScroll: 600,
    });
  });

  it("hands back nothing to a body on the surface the place was left on (a remount that is not a move)", async () => {
    const { recallMemoryPlace, rememberMemoryPlace } =
      await import("../src/features/chat/memory-place");
    // A tab closed and opened again, or a conversation switched away from and back to: same
    // surface, and the panel starts over there as it always did.
    rememberMemoryPlace("session:same-surface", {
      surface: "right",
      mode: detail("a.md"),
      listScroll: 0,
      detailScroll: 300,
    });
    expect(recallMemoryPlace("session:same-surface", "right")).toBeNull();
  });

  it("keeps one place per conversation: two Sessions never see each other's", async () => {
    const { recallMemoryPlace, rememberMemoryPlace } =
      await import("../src/features/chat/memory-place");
    rememberMemoryPlace("session:one", {
      surface: "right",
      mode: detail("one.md"),
      listScroll: 0,
      detailScroll: 200,
    });
    rememberMemoryPlace("session:two", {
      surface: "right",
      mode: list,
      listScroll: 400,
      detailScroll: 0,
    });
    expect(recallMemoryPlace("session:one", "merged")?.mode).toEqual(detail("one.md"));
    expect(recallMemoryPlace("session:two", "merged")?.listScroll).toBe(400);
  });

  it("drops a place that is exactly where the panel starts, rather than keeping 'nothing'", async () => {
    const { recallMemoryPlace, rememberMemoryPlace } =
      await import("../src/features/chat/memory-place");
    rememberMemoryPlace("session:walked-back", {
      surface: "right",
      mode: detail("a.md"),
      listScroll: 0,
      detailScroll: 500,
    });
    // The reader walked back to the list and it sits at its top: the panel's own start.
    rememberMemoryPlace("session:walked-back", {
      surface: "right",
      mode: list,
      listScroll: 0,
      detailScroll: 0,
    });
    expect(recallMemoryPlace("session:walked-back", "merged")).toBeNull();
  });

  it("remembers a scrolled list with nothing open: halfway down the rows is a place too", async () => {
    const { recallMemoryPlace, rememberMemoryPlace } =
      await import("../src/features/chat/memory-place");
    rememberMemoryPlace("session:list-scrolled", {
      surface: "right",
      mode: list,
      listScroll: 400,
      detailScroll: 0,
    });
    expect(recallMemoryPlace("session:list-scrolled", "merged")).toMatchObject({
      mode: { kind: "list" },
      listScroll: 400,
    });
  });

  it("keeps a workspace scope's memory as the level, scope key and all", async () => {
    const { recallMemoryPlace, rememberMemoryPlace } =
      await import("../src/features/chat/memory-place");
    rememberMemoryPlace("session:workspace-scope", {
      surface: "bottom",
      mode: detail("probe.md", "/root/project"),
      listScroll: 0,
      detailScroll: 90,
    });
    expect(recallMemoryPlace("session:workspace-scope", "merged")?.mode).toEqual(
      detail("probe.md", "/root/project"),
    );
  });

  it("copies both ways: the caller's mode cannot reach the record, nor the record the caller", async () => {
    const { recallMemoryPlace, rememberMemoryPlace } =
      await import("../src/features/chat/memory-place");
    const mode = detail("a.md");
    rememberMemoryPlace("session:copied", {
      surface: "right",
      mode,
      listScroll: 0,
      detailScroll: 120,
    });
    if (mode.kind === "detail") mode.target.file = "later.md";
    expect(recallMemoryPlace("session:copied", "merged")?.mode).toEqual(detail("a.md"));

    const recalled = recallMemoryPlace("session:copied", "merged");
    if (recalled?.mode.kind === "detail") recalled.mode.target.file = "elsewhere.md";
    expect(recallMemoryPlace("session:copied", "merged")?.mode).toEqual(detail("a.md"));
  });

  it("names the memory a mode is about, and nothing for the list", async () => {
    const { memoryPlaceKey } = await import("../src/features/chat/memory-place");
    expect(memoryPlaceKey(list)).toBeNull();
    // The same key memory-changes.ts hands rows and targets: scope, scope key, file.
    expect(memoryPlaceKey(detail("a.md"))).toBe("user  a.md");
    expect(memoryPlaceKey(detail("a.md", "/root/project"))).toBe("workspace /root/project a.md");
  });
});
