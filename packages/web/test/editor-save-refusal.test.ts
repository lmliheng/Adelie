/**
 * The Files panel editor's save branch (src/features/chat/editor-save-refusal.ts): the sentence a
 * refused write leaves under the header, and whose words it uses.
 *
 * A refused save writes nothing, so the editor is still open holding the draft — that surface is
 * where the sentence belongs, and it is the reason this test exists: a toast would be gone after
 * six seconds while the text that was not written sits on screen. The draft-versus-file half is
 * the other thing worth pinning: the reader has to be told the file did not take their text, and
 * a save pressed on an untouched editor must not claim anything was lost.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { editorSaveRefusal } from "../src/features/chat/editor-save-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("editorSaveRefusal", () => {
  it("reads a server answer through its code's own localized sentence", () => {
    const refused = new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE");
    const line = editorSaveRefusal(refused, "new text", "old text");
    expect(line).toContain(S.errors.byCode["internal"] as string);
    expect(line).not.toContain("RAW ENGLISH");
    // The Chinese UI says so in Chinese; nothing of the wire message leaks through.
    expect(line.startsWith(S.files.saveRefused(""))).toBe(true);
  });

  it("says the edits are still only in the editor when the file did not take them", () => {
    const refused = new ApiError(413, "payload_too_large", "body too large");
    const line = editorSaveRefusal(refused, "draft text", "stored text");
    expect(line).toBe(S.files.saveRefusedDraftKept(S.errors.byCode["payload_too_large"] as string));
    expect(line).toContain("编辑器里的改动没有写进文件");
  });

  it("claims nothing was lost when the save carried the file's own text", () => {
    const refused = new ApiError(500, "internal", "RAW ENGLISH");
    const line = editorSaveRefusal(refused, "same text", "same text");
    expect(line).toBe(S.files.saveRefused(S.errors.byCode["internal"] as string));
    expect(line).not.toContain("没有写进文件");
  });

  it("shows a value this codebase raised itself as it wrote it", () => {
    // The panel raises its own conditions (a precondition it could not read, most likely); those
    // sentences are already meant for the reader, so they are not replaced by a generic one.
    const raised = new Error("读取文件版本失败，请重试");
    expect(editorSaveRefusal(raised, "draft", "stored")).toBe(
      S.files.saveRefusedDraftKept("读取文件版本失败，请重试"),
    );
  });

  it("falls back to the generic sentence for a value with nothing to say", () => {
    expect(editorSaveRefusal(undefined, "same", "same")).toBe(
      S.files.saveRefused(S.common.unknownError),
    );
  });

  it("follows the active language", () => {
    setActiveStrings(EN);
    const refused = new ApiError(500, "internal", "RAW ENGLISH");
    const line = editorSaveRefusal(refused, "draft", "stored");
    expect(line.startsWith("Could not save: ")).toBe(true);
    expect(line).toContain("still in the editor, not in the file");
  });
});
