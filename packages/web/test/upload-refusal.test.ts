/**
 * The Files panel's upload branch (src/features/chat/upload-refusal.ts): the sentence a refused
 * upload leaves above the listing, and whose words it uses.
 *
 * A refused upload writes nothing, so the panel is still showing the directory without the files —
 * that surface is where the sentence belongs, and it is the reason this test exists: a toast would
 * be gone after six seconds while the files sit on the reader's disk and nowhere in the Workspace.
 * The whole-batch-versus-partly half is the other thing worth pinning: when some files landed and
 * the rest did not, naming the rest is the only way to know what to pick again.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { uploadRefusalLine } from "../src/features/chat/upload-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("uploadRefusalLine", () => {
  it("reads a server answer through its code's own localized sentence", () => {
    const refused = new ApiError(403, "dir_permission_denied", "RAW ENGLISH SERVER MESSAGE");
    const line = uploadRefusalLine(refused, "docs", 0, ["notes.md"]);
    expect(line).toContain(S.errors.byCode["dir_permission_denied"] as string);
    expect(line).not.toContain("RAW ENGLISH");
    // The Chinese UI says so in Chinese; nothing of the wire message leaks through.
    expect(line.startsWith(S.files.uploadRefused("docs", ""))).toBe(true);
  });

  it("says nothing landed when the first file was refused", () => {
    const refused = new ApiError(500, "internal", "boom");
    expect(uploadRefusalLine(refused, "docs", 0, ["a.txt", "b.txt"])).toBe(
      S.files.uploadRefused("docs", S.errors.byCode["internal"] as string),
    );
  });

  it("names the files that did not land when part of the batch went through", () => {
    const refused = new ApiError(413, "payload_too_large", "body too large");
    const line = uploadRefusalLine(refused, "docs", 2, ["c.txt", "d.txt"]);
    expect(line).toBe(
      S.files.uploadRefusedPartial(
        "docs",
        "c.txt, d.txt",
        S.errors.byCode["payload_too_large"] as string,
      ),
    );
    // The files that already landed are not named as failures.
    expect(line).not.toContain("a.txt");
  });

  it("names the target directory as the panel labels it", () => {
    // The Workspace root reaches this module already labelled ("."), which is how the rest of the
    // panel names it — an upload can go to a folder other than the one in view.
    const refused = new ApiError(500, "internal", "boom");
    expect(uploadRefusalLine(refused, S.files.root, 0, ["a.txt"])).toBe(
      S.files.uploadRefused(S.files.root, S.errors.byCode["internal"] as string),
    );
  });

  it("shows a value this codebase raised itself as it wrote it", () => {
    const raised = new Error("读取文件内容失败，请重试");
    expect(uploadRefusalLine(raised, "docs", 0, ["a.txt"])).toBe(
      S.files.uploadRefused("docs", "读取文件内容失败，请重试"),
    );
  });

  it("falls back to the generic sentence for a value with nothing to say", () => {
    expect(uploadRefusalLine(undefined, "docs", 0, ["a.txt"])).toBe(
      S.files.uploadRefused("docs", S.common.unknownError),
    );
  });

  it("follows the active language", () => {
    setActiveStrings(EN);
    const refused = new ApiError(403, "dir_permission_denied", "RAW ENGLISH");
    const line = uploadRefusalLine(refused, "docs", 0, ["a.txt"]);
    expect(line.startsWith("Could not upload to docs: ")).toBe(true);
  });
});
