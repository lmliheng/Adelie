/**
 * The add-group dialog's import line (src/features/models/group-import-refusal.ts): which answer
 * gets a sentence, and what that sentence has to say.
 *
 * The import is one whole-table write, so a refusal writes nothing and the dialog stays up with
 * the fields the retry sends — this line is the only account of the press once the six-second
 * notification is gone. That is why it has to name the two facts a reader needs before retrying:
 * which group was not created, and that the table behind the dialog did not move either.
 */
import { afterEach, describe, expect, it } from "vitest";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { groupImportRefusal } from "../src/features/models/group-import-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("groupImportRefusal", () => {
  it("says nothing for a written import", () => {
    // A written import closes the dialog, so there is no line for it to draw.
    expect(groupImportRefusal("probegroup", { ok: true })).toBeNull();
  });

  it("names the group and keeps the server's words for a refused one", () => {
    const line = groupImportRefusal("probeimport", {
      ok: false,
      reason: "models store is closed",
    });
    expect(line).toContain("probeimport");
    expect(line).toContain("models store is closed");
  });

  it("says the table did not move, not just that the write failed", () => {
    // The dialog stays open over a page that still has no such group: the reader has to know the
    // listing did not half-land, which is the one thing a bare "saving failed" leaves open.
    const line = groupImportRefusal("probeimport", {
      ok: false,
      reason: "服务器内部错误，请稍后重试。",
    });
    expect(line).toBe(S.models.groupImportRefused("probeimport", "服务器内部错误，请稍后重试。"));
    expect(line).toContain("一个都没写进表");
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    const line = groupImportRefusal("probeimport", { ok: false, reason: "models store is closed" });
    expect(line).toContain("probeimport");
    expect(line).toContain("not created");
    expect(line).toContain("models store is closed");
  });
});
