/**
 * What the Plugins page says when it could not read the configuration it draws — the first read
 * on mount (`pluginConfigUnreadable`) and the one an install makes afterwards
 * (`pluginConfigStale`). Neither may go to a toast: the first leaves the page empty under it, and
 * the second leaves the cards saying what the machine answered before the install.
 *
 * - A picked machine is named: it is the one that could not answer.
 * - This server is not: the picker's bare "This server" would read as a machine's name inside
 *   the machine phrasing, so this server has words of its own.
 * - The reason travels through as given — the caller's `apiErrorText` has already turned the
 *   server's code into the app's own sentence.
 * - The sentence speaks the interface's language.
 * - The two are not the same sentence: one says the page is empty, the other says the cards kept
 *   what the machine said before the install, and confusing them would claim a full page is
 *   blank.
 */
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import {
  pluginConfigStale,
  pluginConfigUnreadable,
} from "../src/features/settings/plugin-config-read";

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

describe("pluginConfigStale", () => {
  it("names the machine whose state could not be read again", () => {
    expect(pluginConfigStale(MACHINE, REASON)).toBe(S.plugins.machineStale(MACHINE, REASON));
    expect(pluginConfigStale(MACHINE, REASON)).toContain(MACHINE);
  });

  it("speaks of this server without printing a machine name", () => {
    const line = pluginConfigStale(null, REASON);
    expect(line).toBe(S.plugins.thisServerStale(REASON));
    // Not the machine phrasing with the picker's bare label in it (as above).
    expect(line).not.toBe(S.plugins.machineStale(S.plugins.thisServer, REASON));
  });

  it("carries the reason through as given", () => {
    expect(pluginConfigStale(null, REASON)).toContain(S.errors.byCode.internal);
    expect(pluginConfigStale(MACHINE, REASON)).toContain(S.errors.byCode.internal);
  });

  it("says the cards may be out of date rather than that nothing was read", () => {
    // The blank-page sentence over cards that are on screen would misdescribe the page.
    expect(pluginConfigStale(null, REASON)).not.toBe(pluginConfigUnreadable(null, REASON));
    expect(pluginConfigStale(null, REASON)).not.toBe(pluginConfigStale(MACHINE, REASON));
  });

  it("speaks English when the interface does", () => {
    setActiveStrings(EN);
    expect(pluginConfigStale(null, EN.errors.byCode.internal)).toBe(
      EN.plugins.thisServerStale(EN.errors.byCode.internal),
    );
    expect(pluginConfigStale(MACHINE, EN.errors.byCode.internal)).toContain(MACHINE);
  });
});
