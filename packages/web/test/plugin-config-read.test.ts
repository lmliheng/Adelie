/**
 * What the Plugins page says when it could not read the configuration it draws
 * (`pluginConfigUnreadable`): the page draws nothing until that read lands, so a failed one has
 * to hand it a sentence for the empty page rather than a toast that dismisses itself.
 *
 * - A picked machine is named: it is the one that could not answer.
 * - This server is not: the picker's bare "This server" would read as a machine's name inside
 *   the machine phrasing, so this server has words of its own.
 * - The reason travels through as given — the caller's `apiErrorText` has already turned the
 *   server's code into the app's own sentence.
 * - The sentence speaks the interface's language.
 */
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { pluginConfigUnreadable } from "../src/features/settings/plugin-config-read";

const MACHINE = "gpu-box";
const REASON = S.errors.byCode.internal;

afterEach(() => {
  setActiveStrings(ZH);
});

describe("pluginConfigUnreadable", () => {
  it("names the machine that could not answer", () => {
    expect(pluginConfigUnreadable(MACHINE, REASON)).toBe(
      S.plugins.machineUnreadable(MACHINE, REASON),
    );
    expect(pluginConfigUnreadable(MACHINE, REASON)).toContain(MACHINE);
  });

  it("speaks of this server without printing a machine name", () => {
    const line = pluginConfigUnreadable(null, REASON);
    expect(line).toBe(S.plugins.thisServerUnreadable(REASON));
    // The picker's label is not glued into the machine phrasing ("无法读取 本机 运行的插件") —
    // this server gets its own sentence.
    expect(line).not.toBe(S.plugins.machineUnreadable(S.plugins.thisServer, REASON));
  });

  it("carries the reason through as given", () => {
    expect(pluginConfigUnreadable(null, REASON)).toContain(S.errors.byCode.internal);
    expect(pluginConfigUnreadable(MACHINE, REASON)).toContain(S.errors.byCode.internal);
  });

  it("speaks English when the interface does", () => {
    setActiveStrings(EN);
    expect(pluginConfigUnreadable(null, EN.errors.byCode.internal)).toBe(
      EN.plugins.thisServerUnreadable(EN.errors.byCode.internal),
    );
    expect(pluginConfigUnreadable(MACHINE, EN.errors.byCode.internal)).toContain(MACHINE);
  });
});
