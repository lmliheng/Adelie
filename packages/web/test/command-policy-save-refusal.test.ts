/**
 * A Save the Project settings dialog refused (src/lib/command-policy-save-refusal.ts): the
 * sentence the security-policy page draws above its Save button.
 *
 * One Save PUTs the whole `[command_policy]` block — the master switch and every rule — so a
 * refusal leaves controls on screen that show a state the engine is not running. Three things the
 * sentence has to get right: which policy is still in force when the switch was part of the
 * attempt, that an untouched switch is never reported as flipped, and that an answer the server
 * gave speaks the interface's own language rather than the wire message where a code is mapped.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { commandPolicySaveRefused } from "../src/lib/command-policy-save-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("commandPolicySaveRefused", () => {
  it("a refused switch-off says blocking is still on", () => {
    const refusal = commandPolicySaveRefused(
      { enabled: false, savedEnabled: true },
      new ApiError(500, "internal", "Internal server error."),
    );
    expect(refusal.attempt).toEqual({ enabled: false, savedEnabled: true });
    // The engine's own state, not the draft the switch shows: the port is still guarded.
    expect(refusal.text).toBe(S.project.commandPolicyRefusedStillOn(S.errors.byCode.internal!));
  });

  it("a refused switch-on says blocking is still off", () => {
    const refusal = commandPolicySaveRefused(
      { enabled: true, savedEnabled: false },
      new Error("Failed to write .project_config.toml"),
    );
    expect(refusal.text).toBe(
      S.project.commandPolicyRefusedStillOff("Failed to write .project_config.toml"),
    );
  });

  it("a refused rule-list edit does not claim the switch moved either way", () => {
    const reason = 'Rule "rm" has an invalid regular expression: (';
    const refusal = commandPolicySaveRefused(
      { enabled: true, savedEnabled: true },
      new ApiError(400, "invalid_rule_pattern", reason),
    );
    expect(refusal.text).toBe(S.project.commandPolicyRefused(reason));
    // Neither of the two switch sentences, which name a state this attempt never tried to change.
    expect(refusal.text).not.toBe(S.project.commandPolicyRefusedStillOn(reason));
    expect(refusal.text).not.toBe(S.project.commandPolicyRefusedStillOff(reason));
  });

  it("reads a mapped code through the interface's own words, not the wire message", () => {
    const refusal = commandPolicySaveRefused(
      { enabled: true, savedEnabled: true },
      new ApiError(500, "internal", "Internal server error."),
    );
    expect(refusal.text).not.toContain("Internal server error.");
    expect(refusal.text).toBe(S.project.commandPolicyRefused(S.errors.byCode.internal!));
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(commandPolicySaveRefused({ enabled: true, savedEnabled: true }, undefined).text).toBe(
      S.project.commandPolicyRefused(S.common.unknownError),
    );
  });

  it("speaks the language the interface is in, not the one it was built in", () => {
    setActiveStrings(EN);
    expect(
      commandPolicySaveRefused({ enabled: false, savedEnabled: true }, new Error("boom")).text,
    ).toBe(EN.project.commandPolicyRefusedStillOn("boom"));
  });
});
