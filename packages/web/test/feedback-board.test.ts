/**
 * The public feedback board the account menu links to (lib/feedback-board.ts).
 *
 * - The row opens the product's own board, in a new tab and with no handle back to this window
 *   (`noopener,noreferrer`) — the shape the app opens every off-app destination with.
 * - The address is the product's, pinned by name here rather than left to the row: it is the same
 *   one in every install, so a change to it is a change to the product and belongs in a diff.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { FEEDBACK_BOARD_URL, openFeedbackBoard } from "../src/lib/feedback-board";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openFeedbackBoard", () => {
  it("opens the board in a new, isolated tab", () => {
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    openFeedbackBoard();
    expect(open).toHaveBeenCalledWith(FEEDBACK_BOARD_URL, "_blank", "noopener,noreferrer");
  });

  it("is the product's board, not a per-install setting", () => {
    expect(FEEDBACK_BOARD_URL).toBe("https://txc.qq.com/products/802227");
  });
});
