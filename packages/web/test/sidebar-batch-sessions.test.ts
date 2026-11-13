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

  it("says how many of a refused batch did not go, before the server's words", () => {
    expect(zh.chat.batchDeleteRefused(2, "session store is read-only")).toBe(
      "还有 2 个对话没有删除：session store is read-only",
    );
    expect(en.chat.batchDeleteRefused(1, "session store is read-only")).toBe(
      "1 of the selected chats were not deleted: session store is read-only",
    );
  });

  it("says how many of a refused archive did not change, in both dictionaries", () => {
    expect(zh.chat.batchArchiveRefused(2, "session store is read-only")).toBe(
      "还有 2 个对话没有归档：session store is read-only",
    );
    expect(zh.chat.batchUnarchiveRefused(1, "session store is read-only")).toBe(
      "还有 1 个对话没有取消归档：session store is read-only",
    );
    expect(en.chat.batchArchiveRefused(1, "session store is read-only")).toBe(
      "1 of the selected chats were not archived: session store is read-only",
    );
    expect(en.chat.batchUnarchiveRefused(2, "session store is read-only")).toBe(
      "2 of the selected chats were not unarchived: session store is read-only",
    );
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
    // A batch is N writes, so its outcomes are read per row — `all` would drop the rows that did
    // land, and only the landed ones may be forgotten.
    expect(SIDEBAR).toContain("await Promise.allSettled(");
    expect(SIDEBAR).toContain("forgetDeletedSessions(landedRows);");
    // Both actions read their outcomes through the one splitter, so neither can drift from the
    // rule that a batch is N writes (lib/batch-outcome.ts).
    expect(SIDEBAR.match(/splitBatchOutcome\(targets, results\)/g)).toHaveLength(2);
  });

  it("keeps the delete's confirmation, asked once for the whole selection", () => {
    expect(SIDEBAR).toContain("title={S.chat.batchDeleteTitle}");
    expect(SIDEBAR).toContain("onConfirm={() => void confirmBatchDelete()}");
    expect(SIDEBAR).toContain("S.chat.batchDeleteConfirm(batchSelected.size)");
    // A partially refused batch keeps the card, and the reason goes in it (not in a toast).
    expect(SIDEBAR).toContain(
      "refusal={batchDeleteRefusal === null ? undefined : batchDeleteRefusal}",
    );
    expect(SIDEBAR).toContain(
      "S.chat.batchDeleteRefused(refused.length, apiErrorText(firstReason))",
    );
  });

  it("drops the ticks when the mode is left, and leaves only the rows that did not go", () => {
    expect(TOGGLE).toContain("setBatchMode(false)");
    expect(TOGGLE).toContain("setBatchSelected(new Set())");
    // Neither action clears the selection outright: both keep exactly the refused rows ticked, so
    // a fully landed batch clears them by itself and a partial one leaves the retry's rows.
    expect(
      SIDEBAR.match(/setBatchSelected\(new Set\(refused\.map\(\(s\) => s\.sessionId\)\)\);/g),
    ).toHaveLength(2);
    // "取消选择" is the explicit way out, and it takes the bar's last refusal with it.
    const clear = SIDEBAR.slice(
      SIDEBAR.indexOf("const clearBatchSelection = () => {"),
      SIDEBAR.indexOf("/**", SIDEBAR.indexOf("const clearBatchSelection = () => {")),
    );
    expect(clear).toContain("setBatchArchiveRefusal(null);");
    expect(clear).toContain("setBatchSelected(new Set());");
  });

  it("keeps a refused archive in the bar, over exactly the rows a retry would act on", () => {
    const bar = SIDEBAR.slice(
      SIDEBAR.indexOf("{batchMode && batchSelected.size > 0 && ("),
      SIDEBAR.indexOf("unsent new chats, newest first"),
    );
    // No card asks before an archive, so the bar that holds its two buttons is where its refusal
    // has to be read — not a toast above a list that looks untouched.
    expect(bar).toContain("batchArchiveRefusal !== null");
    expect(bar).toContain('data-testid="batch-archive-refusal"');
    expect(bar).toContain("{batchArchiveRefusal}");
    expect(SIDEBAR).toContain(
      "S.chat.batchArchiveRefused(refused.length, apiErrorText(firstReason))",
    );
    expect(SIDEBAR).toContain(
      "S.chat.batchUnarchiveRefused(refused.length, apiErrorText(firstReason))",
    );
    // Rows that landed take the server's own copy (the archived flag that moves them into the
    // folder); the refused ones stay ticked, and a fully landed batch still just says so.
    expect(SIDEBAR).toContain("for (const row of landed) replace(row.value.session);");
    expect(SIDEBAR).toContain("if (refused.length === 0) {");
    expect(SIDEBAR).toContain("S.chat.batchArchiveDone(landed.length)");
  });

  it("stops reordering rows while they are being picked", () => {
    expect(SIDEBAR).toContain("dragCtx === undefined || batchMode");
  });
});
