/**
 * The Files panel's pick skips (src/features/chat/pick-skip-refusal.ts): the sentence left above the
 * listing when the panel itself would not hand a picked file to the upload route — over the
 * endpoint's ceiling, or a folder a drop cannot turn into a file.
 *
 * Nothing is read and no request goes out, so no server sentence exists to draw and the panel looks
 * exactly as it did before the pick. That is the reason this test exists: what used to be a
 * six-second toast is now the only lasting trace of the gesture, and it has to name every file it
 * speaks for — one kind, both kinds, and the case where the upload of the rest was refused too.
 */
import { afterEach, describe, expect, it } from "vitest";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { pickSkipLine, withPickSkips } from "../src/features/chat/pick-skip-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("pickSkipLine", () => {
  it("says nothing when the pick handed everything over", () => {
    // A pick with nothing skipped must clear the previous sentence rather than draw an empty one.
    expect(pickSkipLine({ dirs: [], oversize: [] }, 14)).toBeNull();
  });

  it("names the oversize files and the ceiling they hit", () => {
    expect(pickSkipLine({ dirs: [], oversize: ["a.bin", "b.bin"] }, 14)).toBe(
      S.files.uploadTooLarge("a.bin, b.bin", 14),
    );
  });

  it("names a dropped folder", () => {
    expect(pickSkipLine({ dirs: ["docs"], oversize: [] }, 14)).toBe(
      S.files.folderDropSkipped("docs"),
    );
  });

  it("keeps both halves when one pick hit both", () => {
    // A drag can carry a folder and an oversize file at once; one of the two halves alone would
    // leave a file the reader believes was sent.
    expect(pickSkipLine({ dirs: ["docs"], oversize: ["a.bin"] }, 14)).toBe(
      `${S.files.uploadTooLarge("a.bin", 14)}${S.files.pickSkipSeparator}${S.files.folderDropSkipped("docs")}`,
    );
  });

  it("follows the active language", () => {
    setActiveStrings(EN);
    const line = pickSkipLine({ dirs: [], oversize: ["a.bin"] }, 14);
    expect(line).toBe("Over the 14MB upload limit, skipped: a.bin");
  });
});

describe("withPickSkips", () => {
  it("leaves the server's own sentence alone when the pick skipped nothing", () => {
    expect(withPickSkips(S.files.uploadRefused(".", "服务器内部错误"), null)).toBe(
      S.files.uploadRefused(".", "服务器内部错误"),
    );
  });

  it("keeps the skipped names after a refused upload, so nothing said earlier is lost", () => {
    // The batch's refusal speaks about the files it tried; the ones it never got were named a
    // moment before and would otherwise disappear with them.
    const refused = S.files.uploadRefused(".", S.errors.byCode["internal"] as string);
    expect(withPickSkips(refused, S.files.uploadTooLarge("a.bin", 14))).toBe(
      `${refused}${S.files.pickSkipSeparator}${S.files.uploadTooLarge("a.bin", 14)}`,
    );
  });
});
