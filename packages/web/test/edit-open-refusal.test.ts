/**
 * The Files panel's Edit branch (src/features/chat/edit-open-refusal.ts): the sentence the panel
 * draws when the editor could not be opened, and whose words it uses.
 *
 * Edit is not always itself a refusal the reader can see: an isolated HTML preview carries no
 * text, so the click reads the file, and that read is where an oversize file or a failed fetch
 * turns the click into nothing at all. The panel looks untouched either way, which is why the
 * sentence has to stay on it — a toast would be gone after six seconds while the Edit button sits
 * there looking as though it had not been pressed. Both halves are pinned here.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import {
  editOpenFailedRefusal,
  editOpenTooLargeRefusal,
} from "../src/features/chat/edit-open-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("editOpenTooLargeRefusal", () => {
  // The panel's own measurement — nothing was sent and nothing failed: the file was read, found
  // longer than the preview ceiling, and the editor cannot hold it whole.
  it("names the preview ceiling and what to do instead", () => {
    const line = editOpenTooLargeRefusal(1024);
    expect(line).toBe(S.files.editTooLarge(1024));
    expect(line).toContain("1024KB");
    expect(line).toContain("请下载后编辑");
  });

  it("follows the active language", () => {
    setActiveStrings(EN);
    const line = editOpenTooLargeRefusal(1024);
    expect(line).toContain("1024KB");
    expect(line).toContain("download it instead");
  });
});

describe("editOpenFailedRefusal", () => {
  it("reads a server answer through its code's own localized sentence", () => {
    const refused = new ApiError(404, "not_found", "RAW ENGLISH SERVER MESSAGE");
    const line = editOpenFailedRefusal(refused);
    expect(line).toBe(S.files.editOpenFailed(S.errors.byCode["not_found"] as string));
    expect(line).not.toContain("RAW ENGLISH");
    expect(line.startsWith("无法打开编辑器：")).toBe(true);
  });

  it("shows a value this codebase raised itself as it wrote it", () => {
    // The panel raises its own conditions (a body it could not read, most likely); those
    // sentences are already meant for the reader, so they are not replaced by a generic one.
    const raised = new Error("读取文件失败，请重试");
    expect(editOpenFailedRefusal(raised)).toBe(S.files.editOpenFailed("读取文件失败，请重试"));
  });

  it("falls back to the generic sentence for a value with nothing to say", () => {
    expect(editOpenFailedRefusal(undefined)).toBe(S.files.editOpenFailed(S.common.unknownError));
  });

  it("follows the active language", () => {
    setActiveStrings(EN);
    const refused = new ApiError(404, "not_found", "RAW ENGLISH");
    expect(editOpenFailedRefusal(refused).startsWith("Could not open the editor: ")).toBe(true);
  });
});
