/**
 * Batch processing on the sidebar's conversation list (components/layout/sidebar.tsx): the header
 * control beside 搜索会话 turns every conversation row into a picker, ticking rows raise a bar over
 * the list, and the bar archives, unarchives or deletes them together — the requirement box's own
 * batch bar, in the column.
 *
 * The sidebar is a React component the Web App's tests do not render, so what is pinned here is the
 * part a render would not show anyway: the words in both dictionaries (and the count and the
 * permanence they admit to), where the control and the bar sit, that every action rides the route
 * the row's own menu already uses — one request per conversation, the shared cleanup after a
 * delete, the row delete's own confirmation asked once — and that leaving the mode drops the ticks.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const SIDEBAR = read("../src/components/layout/sidebar.tsx");
/** Everything the list header holds — the control must sit in it, beside the search. */
const HEADER = SIDEBAR.slice(0, SIDEBAR.indexOf("</SidebarListHeader>"));
/** The toggle's own body, up to the next handler. */
const TOGGLE = SIDEBAR.slice(
  SIDEBAR.indexOf("const toggleBatchMode = ()"),
  SIDEBAR.indexOf("const toggleBatchRow"),
);

describe("the batch bar's words", () => {
  it("names the mode, the count and the three actions in both dictionaries", () => {
    expect(zh.chat.batchSelect).toBe("批量处理");
    expect(en.chat.batchSelect).toBe("Batch actions");
    expect(zh.chat.batchCount(2)).toBe("已选 2 条");
    expect(en.chat.batchCount(2)).toBe("2 selected");
    for (const dict of [zh, en]) {
      expect(dict.chat.batchArchive).not.toBe("");
      expect(dict.chat.batchUnarchive).not.toBe("");
      expect(dict.chat.batchDelete).not.toBe("");
      expect(dict.chat.batchClear).not.toBe("");
      expect(dict.chat.batchDeleteTitle).not.toBe("");
    }
    expect(zh.chat.batchArchive).toBe("批量归档");
    expect(zh.chat.batchUnarchive).toBe("批量取消归档");
    expect(zh.chat.batchDelete).toBe("批量删除");
  });

  it("reports what an action did, with the count in it", () => {
    expect(zh.chat.batchArchiveDone(3)).toBe("已归档 3 个对话");
    expect(zh.chat.batchUnarchiveDone(3)).toBe("已取消归档 3 个对话");
    expect(en.chat.batchArchiveDone(3)).toBe("Archived 3 chats");
    expect(en.chat.batchUnarchiveDone(3)).toBe("Unarchived 3 chats");
  });

  it("keeps the delete's copy as blunt as the row's own confirmation is", () => {
    expect(zh.chat.batchDeleteConfirm(3)).toContain("3");
    expect(zh.chat.batchDeleteConfirm(3)).toContain("不可恢复");
    expect(en.chat.batchDeleteConfirm(3)).toContain("3");
    expect(en.chat.batchDeleteConfirm(3)).toContain("permanently");
  });

  it("names each row's box after the conversation it stands for", () => {
    expect(zh.chat.batchSelectRow("修构建")).toBe("选中「修构建」");
    expect(en.chat.batchSelectRow("Fix the build")).toBe('Select "Fix the build"');
  });
});

describe("the batch wiring", () => {
  it("hangs the mode off a control in the list header, beside the search", () => {
    expect(HEADER).toContain("label={S.chat.searchSessions}");
    expect(HEADER).toContain("label={S.chat.batchSelect}");
    expect(HEADER).toContain("glyph={ICONS.listChecks}");
    expect(HEADER).toContain("onClick={toggleBatchMode}");
    expect(HEADER.indexOf("label={S.chat.searchSessions}")).toBeLessThan(
      HEADER.indexOf("label={S.chat.batchSelect}"),
    );
  });

  it("raises the bar only over a selection, and gives it the four controls", () => {
    const marker = "{batchMode && batchSelected.size > 0 && (";
    expect(SIDEBAR).toContain(marker);
    // From the bar's own gate to the drafts below it: everything the bar is made of.
    const bar = SIDEBAR.slice(
      SIDEBAR.indexOf(marker),
      SIDEBAR.indexOf("unsent new chats, newest first"),
    );
    expect(bar).toContain("S.chat.batchCount(batchSelected.size)");
    expect(bar).toContain("batchSetArchived(true)");
    expect(bar).toContain("batchSetArchived(false)");
    expect(bar).toContain("setBatchConfirmDelete(true)");
    expect(bar).toContain("clearBatchSelection");
  });

  it("makes every row a picker, ticked from the selection it belongs to", () => {
    expect(SIDEBAR).toContain("checked: batchSelected.has(s.sessionId)");
    expect(SIDEBAR).toContain("onToggle: () => toggleBatchRow(s.sessionId)");
    // The ui row draws the box; the app hands it the label naming the conversation.
    expect(SIDEBAR).toContain(
      "label: S.chat.batchSelectRow(s.title ?? S.chat.defaultSessionTitle)",
    );
    expect(SIDEBAR).toContain("selection: {");
  });

  it("acts through the routes the row's own menu already uses, one request per conversation", () => {
    expect(SIDEBAR).toContain("api.patchSession(s.sessionId, { archived })");
    expect(SIDEBAR).toContain("targets.map((s) => api.deleteSession(s.sessionId))");
    // Both the single delete and the batch leave through the one cleanup.
    expect(SIDEBAR).toContain("forgetDeletedSessions([target]);");
    expect(SIDEBAR).toContain("forgetDeletedSessions(targets);");
  });

  it("keeps the delete's confirmation, asked once for the whole selection", () => {
    expect(SIDEBAR).toContain("title={S.chat.batchDeleteTitle}");
    expect(SIDEBAR).toContain("onConfirm={() => void confirmBatchDelete()}");
    expect(SIDEBAR).toContain("S.chat.batchDeleteConfirm(batchSelected.size)");
  });

  it("drops the ticks when the mode is left, and clears them after an action lands", () => {
    expect(TOGGLE).toContain("setBatchMode(false)");
    expect(TOGGLE).toContain("setBatchSelected(new Set())");
    expect(SIDEBAR).toContain("const clearBatchSelection = () => setBatchSelected(new Set());");
    // Archived and deleted rows are no longer the ones the reader picked.
    expect(SIDEBAR.match(/setBatchSelected\(new Set\(\)\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("stops reordering rows while they are being picked", () => {
    expect(SIDEBAR).toContain("dragCtx === undefined || batchMode");
  });
});
