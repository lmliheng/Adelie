/**
 * The install prompt on the Sandbox card (src/features/settings/sandbox-backend-refusal.ts): the
 * sentence it keeps when a run of backend packages did not leave the machine with what the switch
 * needs.
 *
 * What the test pins is what a reader needs after a refusal: whose words the reason is in, and
 * which packages are named. A package that installed but failed to load is quoted with the
 * server's own words; a request that never answered is read through `refusalText` (7.19), so the
 * code's localized sentence is used rather than the wire's English. Only what is still missing is
 * listed — those are what the button behind the sentence retries, and installing again what
 * already landed reloads the server's plugins for nothing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { backendInstallRefusal } from "../src/features/settings/sandbox-backend-refusal";

const BW = "@adelie/sandbox-bwrap";
const DSH = "@adelie/sandbox-dsh";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("backendInstallRefusal", () => {
  it("says nothing when every offered package installed", () => {
    expect(backendInstallRefusal([], null, [])).toBeNull();
  });

  it("quotes a package that installed but failed to load, in the server's own words", () => {
    const line = backendInstallRefusal([{ pkg: BW, error: "no such module: bwrap" }], null, [BW]);
    expect(line).toContain(S.plugins.deploymentFailedToast(BW, "no such module: bwrap"));
    // The reason is the package's, not a request's — nothing claims the request failed.
    expect(line).not.toContain(S.settings.sandboxBackendPrompt.installStopped(""));
  });

  it("reads a request that never answered through its code's localized sentence", () => {
    const refused = new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE");
    const line = backendInstallRefusal([], { error: refused }, [BW]);
    expect(line).toContain(S.errors.byCode["internal"] as string);
    expect(line).not.toContain("RAW ENGLISH");
  });

  it("names only the packages still missing — what the button retries", () => {
    // The first package landed, the run stopped on the second: only the second is left.
    const line = backendInstallRefusal([], { error: new ApiError(500, "internal", "boom") }, [DSH]);
    expect(line).toContain(DSH);
    expect(line).not.toContain(BW);
  });

  it("does not double the full stop a reason already ends with", () => {
    const line = backendInstallRefusal([], { error: new ApiError(500, "internal", "boom") }, [BW]);
    expect(line).toBe(
      `${S.settings.sandboxBackendPrompt.installStopped(
        S.errors.byCode["internal"] as string,
      )}还没装上：${BW}。可以再点一次「安装」。`,
    );
    expect(line).not.toContain("。。");
  });

  it("keeps every reason when a package failed to load and a later request threw", () => {
    const line = backendInstallRefusal(
      [{ pkg: BW, error: "refused by the kernel" }],
      { error: new ApiError(502, "internal", "boom") },
      [BW, DSH],
    );
    expect(line).toContain(S.plugins.deploymentFailedToast(BW, "refused by the kernel"));
    expect(line).toContain(S.settings.sandboxBackendPrompt.installStopped(""));
    expect(line).toContain("还没装上");
    expect(line?.endsWith(S.settings.sandboxBackendPrompt.installRefused([], [BW, DSH]))).toBe(
      true,
    );
  });

  it("shows a value this codebase raised as it wrote it", () => {
    const line = backendInstallRefusal([], { error: new Error("the prompt has no Project") }, [BW]);
    expect(line).toContain("the prompt has no Project");
    expect(line).not.toContain(S.common.unknownError);
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    const line = backendInstallRefusal([{ pkg: BW, error: "boom" }], null, [BW]);
    expect(line).toBe(
      EN.settings.sandboxBackendPrompt.installRefused(
        [EN.plugins.deploymentFailedToast(BW, "boom")],
        [BW],
      ),
    );
    expect(line).toContain("Not installed yet");
  });
});
