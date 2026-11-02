/**
 * Where a refused trash write lands (`storageTrashRefused`) and how the page names it
 * (`storageTrashKey`). All three writes in the trash used to report a failure in a toast that
 * dismissed itself, while the entry it was about stayed listed exactly as it was — the row is
 * where the retry is, so the line is drawn there.
 *
 * - `restore:<id>` and `purge:<id>` → that row, in the words of the button that was pressed.
 * - `purge:expired` → the batch button, which names no entry, so it gets its own sentence.
 * - The id travels as recorded, and the reason as the server gave it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import {
  storageTrashKey,
  storageTrashRefused,
} from "../src/features/settings/storage-trash-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("storageTrashKey", () => {
  it("names one entry's write by its action and id", () => {
    expect(storageTrashKey("restore", "20261103120000")).toBe("restore:20261103120000");
    expect(storageTrashKey("purge", "20261103120000-2")).toBe("purge:20261103120000-2");
  });

  it("gives the batch that takes no entry a word of its own", () => {
    // An entry's id is a compact timestamp, so it can never be the word this batch is known by.
    expect(storageTrashKey("purgeExpired", null)).toBe("purge:expired");
  });
});

describe("storageTrashRefused", () => {
  it("keeps the key it was given, so the page draws it under that row", () => {
    const key = storageTrashKey("purge", "20261103120000");
    expect(storageTrashRefused(key, "There is no trash entry with that id.").key).toBe(key);
  });

  it("says a refused restore in the restore button's words", () => {
    const refusal = storageTrashRefused(
      storageTrashKey("restore", "20261103120000"),
      "A file already exists at that path.",
    );
    expect(refusal.text).toBe("恢复「20261103120000」被拒：A file already exists at that path.");
  });

  it("says a refused deletion in the delete button's words", () => {
    const refusal = storageTrashRefused(
      storageTrashKey("purge", "20261103120000-2"),
      "There is no trash entry with that id.",
    );
    expect(refusal.text).toBe(
      "彻底删除「20261103120000-2」被拒：There is no trash entry with that id.",
    );
  });

  it("says the batch's refusal as its own sentence, with no entry in it", () => {
    const refusal = storageTrashRefused(
      storageTrashKey("purgeExpired", null),
      "Internal server error",
    );
    expect(refusal.text).toBe("彻底删除已过保留期的条目被拒：Internal server error");
  });

  it("carries the server's reason verbatim, punctuation and all", () => {
    // `refusalText` already localized what it could; whatever it hands over is what is drawn.
    const refusal = storageTrashRefused(
      storageTrashKey("purge", "x"),
      "服务器内部错误，请稍后重试。",
    );
    expect(refusal.text).toBe("彻底删除「x」被拒：服务器内部错误，请稍后重试。");
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    expect(S.settings.storageTrashRefusedPurge("t-1", "nope")).toBe(
      'Deleting "t-1" for good was refused: nope',
    );
    expect(S.settings.storageTrashRefusedExpired("nope")).toBe(
      "Deleting what is past retention was refused: nope",
    );
  });
});
