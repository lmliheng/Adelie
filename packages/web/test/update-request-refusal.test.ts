/**
 * How the update modal names its three refused requests: asking for a check (`check`), starting the
 * download (`download`) and restarting into the release it fetched (`restart`).
 *
 * All three used to be one sentence — "could not run the update action: …" — raised as a toast over
 * the dialog that holds the button which was pressed, and gone six seconds later. These cases pin the
 * things the sentence has to do now that it stays in the modal:
 *
 * - name the step, because the modal stays on that step and the consequence differs (a check that
 *   learned nothing vs. nothing fetched at all vs. the new version installed but not running yet);
 * - carry the reason as it was handed over — `apiErrorText` has already localized what it could.
 *
 * The check sentence must also not claim the lookup failed: that is the flow's own `error` state,
 * which means the server answered with a failure. Here the request never got an answer at all.
 */
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { updateRequestRefused } from "../src/lib/update-request-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("updateRequestRefused", () => {
  it("says the check got no answer, without claiming the lookup itself failed", () => {
    // `S.update.checkFailed` ("检查更新失败") belongs to the flow's `error` state — the server ran the
    // lookup and the lookup failed. A refused request never reached that point, so it says so.
    expect(updateRequestRefused("check", "Internal server error")).toBe(
      "没能检查更新，这次没有问到结果：Internal server error",
    );
    expect(updateRequestRefused("check", "Internal server error")).not.toContain(
      S.update.checkFailed,
    );
  });

  it("says the download never started, so nothing was fetched", () => {
    expect(updateRequestRefused("download", "Internal server error")).toBe(
      "没能开始下载这次更新，更新没有开始：Internal server error",
    );
  });

  it("says the restart did not happen and that the new version is installed but not running", () => {
    // The asymmetry is the point: by the time this button exists the release is already on disk,
    // so silence would leave the reader unsure whether anything had been installed at all.
    expect(updateRequestRefused("restart", "Internal server error")).toBe(
      "没能重启，新版本已装好但还没有生效：Internal server error",
    );
  });

  it("carries the reason verbatim, punctuation and all", () => {
    // `apiErrorText` already localized what it could; whatever it hands over is what is drawn.
    expect(updateRequestRefused("download", "服务器内部错误，请稍后重试。")).toBe(
      "没能开始下载这次更新，更新没有开始：服务器内部错误，请稍后重试。",
    );
  });

  it("tells the three steps apart", () => {
    // Same reason, three sentences: a refused check must not read like a refused download, and
    // neither like a refused restart.
    const sentences = new Set([
      updateRequestRefused("check", "nope"),
      updateRequestRefused("download", "nope"),
      updateRequestRefused("restart", "nope"),
    ]);
    expect(sentences.size).toBe(3);
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    expect(S.update.checkRefused("nope")).toBe(
      "Could not check for updates — no answer this time: nope",
    );
    expect(S.update.downloadRefused("nope")).toBe("Could not start downloading this update: nope");
    expect(S.update.restartRefused("nope")).toBe(
      "Could not restart, so the new version is installed but not running yet: nope",
    );
  });
});
