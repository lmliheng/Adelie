/**
 * How the Agent settings tabs name a refused flip of a feature's enable switch
 * (`featureSwitchRefused`): the Memory tab's own card, and the card shared by Skills / Vault /
 * Schedules / Hooks.
 *
 * None of those switches move optimistically — the card shows the position the server answered
 * with — so a toast used to be the only account of a failure, and six seconds later the switch
 * looked as though it had been pressed and come back by itself.
 *
 * - The sentence names the direction that failed ("开启" / "关闭"), because the switch is still in
 *   the other position: naming the wrong one would answer a question nobody asked.
 * - It names the feature with its own noun, not the card's label — every label already begins with
 *   "启用" / "Enable", and reading that back inside a sentence about turning it on says it twice.
 * - The reason is whatever the server gave, verbatim.
 */
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { featureSwitchRefused } from "../src/features/agents/feature-switch-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("featureSwitchRefused", () => {
  it("names turning the feature on as the ask that failed", () => {
    expect(featureSwitchRefused("记忆", true, "Internal server error")).toBe(
      "开启记忆的开关被拒：Internal server error",
    );
  });

  it("names turning it off as a different ask", () => {
    // The switch is still where the server has it, so the direction cannot be inferred on screen.
    expect(featureSwitchRefused("记忆", false, "Internal server error")).toBe(
      "关闭记忆的开关被拒：Internal server error",
    );
  });

  it("carries the server's reason verbatim, punctuation and all", () => {
    expect(featureSwitchRefused("钩子", true, "服务器内部错误，请稍后重试。")).toBe(
      "开启钩子的开关被拒：服务器内部错误，请稍后重试。",
    );
  });

  it("names the feature the card belongs to, so each tab's line says which switch", () => {
    // Every noun travels with its own card: two tabs are never on screen at once, but the sentence
    // has to be right for the one that is.
    expect(featureSwitchRefused(S.memory.switchNoun, false, "nope")).toBe(
      "关闭记忆的开关被拒：nope",
    );
    expect(featureSwitchRefused(S.skills.injection.switchNoun, false, "nope")).toBe(
      "关闭技能的开关被拒：nope",
    );
    expect(featureSwitchRefused(S.vault.injection.switchNoun, false, "nope")).toBe(
      "关闭密钥保险柜的开关被拒：nope",
    );
    expect(featureSwitchRefused(S.schedule.injection.switchNoun, true, "nope")).toBe(
      "开启定时任务的开关被拒：nope",
    );
    expect(featureSwitchRefused(S.hooks.injection.switchNoun, true, "nope")).toBe(
      "开启钩子的开关被拒：nope",
    );
  });

  it("does not repeat the label's own 启用", () => {
    // The trap the noun exists for: "启用技能" is the label, and "开启启用技能" says it twice.
    expect(featureSwitchRefused(S.skills.injection.switchNoun, true, "nope")).not.toContain(
      "开启启用",
    );
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    expect(S.agent.switchOnRefused("memory", "nope")).toBe(
      "Turning the memory switch on was refused: nope",
    );
    expect(S.agent.switchOffRefused("memory", "nope")).toBe(
      "Turning the memory switch off was refused: nope",
    );
    expect(featureSwitchRefused(S.hooks.injection.switchNoun, true, "nope")).toBe(
      "Turning the hooks switch on was refused: nope",
    );
  });
});
