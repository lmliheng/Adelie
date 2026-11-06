/**
 * A refused install of a library plugin onto an Agent (src/features/plugins/install-refusal.ts):
 * which words are drawn, and on which card.
 *
 * The install is the one write these controls make with no question in front of it, and it moves
 * the page's snapshot optimistically — so on a refusal the card that sent the request has already
 * been unmounted once and comes back to be redrawn by the page's sentence. That is what this test
 * pins: the reason names the Agent it could not reach (the Modal has one row per Agent, and the
 * card's button follows the page's selection), and it is handed to the card of its own plugin and
 * to no other — a toast would be gone after six seconds while the retry stayed on screen.
 */
import { afterEach, describe, expect, it } from "vitest";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import {
  installRefusalFor,
  installRefused,
  type InstallRefusal,
} from "../src/features/plugins/install-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

const refusal: InstallRefusal = { plugin: "probe-plugin", text: "x" };

describe("installRefused", () => {
  it("names the plugin and the Agent it could not go to, then the reason", () => {
    // The reason arrives already localized (toggleInstall reads it through apiErrorText, whose
    // rule is refusalText for a value no server answered): it is carried through verbatim.
    const line = installRefused("probe-plugin", "General Agent", "没有访问该目录的权限。");
    expect(line).toBe(
      S.plugins.installRefused("probe-plugin", "General Agent", "没有访问该目录的权限。"),
    );
    expect(line).toContain("probe-plugin");
    expect(line).toContain("General Agent");
    expect(line).toContain("没有访问该目录的权限。");
  });

  it("speaks the interface language", () => {
    setActiveStrings(EN);
    expect(installRefused("probe-plugin", "General Agent", "denied")).toBe(
      S.plugins.installRefused("probe-plugin", "General Agent", "denied"),
    );
    expect(installRefused("probe-plugin", "General Agent", "denied")).toContain(
      "Could not install probe-plugin to General Agent: denied",
    );
  });
});

describe("installRefusalFor", () => {
  it("hands the sentence to the card of the plugin it was about", () => {
    expect(installRefusalFor(refusal, "probe-plugin")).toBe("x");
  });

  it("hands it to no other plugin's card", () => {
    expect(installRefusalFor(refusal, "another-plugin")).toBeUndefined();
  });

  it("draws nothing when the last install was not refused", () => {
    expect(installRefusalFor(null, "probe-plugin")).toBeUndefined();
  });
});
