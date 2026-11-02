/**
 * Reading one server-wide switch for its settings section (`readServerSwitch` /
 * `serverSwitchRefusal`): the Agent API and company-mode sections both keep their switch disabled
 * until a stored value arrives, so a failed read has to hand the section a sentence instead of
 * throwing — a toast would be gone six seconds later while the switch stays shut.
 *
 * - A read that lands hands back the value the pick chose, out of the settings the server sent.
 * - A server refusal comes back as the app's own sentence for that code, already behind the
 *   shared "refused" lead-in — never the raw English message.
 * - A failure the client raised itself keeps its own sentence; one with nothing to say falls back
 *   to the generic text.
 * - Nothing is thrown: `.then` runs even when the read failed.
 */
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { readServerSwitch, serverSwitchRefusal } from "../src/features/settings/server-switch-read";
import { apiError, json, stubFetch } from "./helpers/fetch";

const serverSettings = (overrides: Record<string, unknown> = {}) =>
  json({ settings: { agentApiEnabled: true, companyMode: false, ...overrides } });

afterEach(() => {
  setActiveStrings(ZH);
});

describe("readServerSwitch", () => {
  it("hands back the one switch the pick chose", async () => {
    stubFetch(() => serverSettings({ agentApiEnabled: false, companyMode: true }));
    const agentApi = await readServerSwitch((settings) => settings.agentApiEnabled);
    const company = await readServerSwitch((settings) => settings.companyMode);
    expect(agentApi).toEqual({ status: "read", value: false });
    expect(company).toEqual({ status: "read", value: true });
  });

  it("answers a failed read with a sentence, not a throw", async () => {
    const fake = stubFetch(() => apiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"));
    const read = await readServerSwitch((settings) => settings.agentApiEnabled);
    expect(read.status).toBe("unread");
    // Localized from the code, behind the shared lead-in — the raw message never reaches the reader.
    expect(serverSwitchRefusal(read)).toBe(S.common.refused(S.errors.byCode.internal));
    expect(serverSwitchRefusal(read)).not.toContain("RAW ENGLISH SERVER MESSAGE");
    expect(fake.requests.map((r) => r.path)).toEqual(["/api/admin/settings"]);
  });

  it("speaks English when the interface does", async () => {
    setActiveStrings(EN);
    stubFetch(() => apiError(404, "not_found"));
    const read = await readServerSwitch((settings) => settings.companyMode);
    expect(serverSwitchRefusal(read)).toBe(EN.common.refused(EN.errors.byCode.not_found));
    expect(serverSwitchRefusal(read)).not.toBe(ZH.common.refused(ZH.errors.byCode.not_found));
  });

  it("names a read that never reached the server as the client's network failure", async () => {
    stubFetch(() => {
      throw new TypeError("network down");
    });
    expect(serverSwitchRefusal(await readServerSwitch(() => true))).toBe(
      S.common.refused(S.errors.networkError),
    );
  });

  it("keeps a sentence the pick itself raised", () => {
    // The read lands, but taking the switch out of it is the caller's code — a body without the
    // field is a bug there, and what it says is still a sentence rather than a throw.
    expect(serverSwitchRefusal({ status: "unread", reason: "设置里没有这个开关" })).toBe(
      S.common.refused("设置里没有这个开关"),
    );
  });

  it("draws nothing once the value was read", () => {
    expect(serverSwitchRefusal({ status: "read", value: false })).toBeNull();
  });
});
