/**
 * Reading what a settings page hydrates from `GET /api/admin/settings` (`readServerSettings` /
 * `settingsReadRefusal`): the Agent API and company-mode switches and the upload-limits form all
 * keep their controls disabled until a stored value arrives, so a failed read has to hand the page
 * a sentence instead of throwing — a toast would be gone six seconds later while the controls
 * stay dead.
 *
 * - A read that lands hands back whatever the pick chose out of the settings the server sent —
 *   one switch, or the pair of numbers the limits form is about.
 * - A server refusal comes back as the app's own sentence for that code, already behind the
 *   shared "refused" lead-in — never the raw English message.
 * - A failure the client raised itself keeps its own sentence; one with nothing to say falls back
 *   to the generic text.
 * - Nothing is thrown: `.then` runs even when the read failed.
 */
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { readServerSettings, settingsReadRefusal } from "../src/features/settings/settings-read";
import { apiError, json, stubFetch } from "./helpers/fetch";

const serverSettings = (overrides: Record<string, unknown> = {}) =>
  json({
    settings: {
      agentApiEnabled: true,
      companyMode: false,
      attachmentMaxMb: 25,
      attachmentTotalMb: 100,
      ...overrides,
    },
  });

afterEach(() => {
  setActiveStrings(ZH);
});

describe("readServerSettings", () => {
  it("hands back the one switch the pick chose", async () => {
    stubFetch(() => serverSettings({ agentApiEnabled: false, companyMode: true }));
    const agentApi = await readServerSettings((settings) => settings.agentApiEnabled);
    const company = await readServerSettings((settings) => settings.companyMode);
    expect(agentApi).toEqual({ status: "read", value: false });
    expect(company).toEqual({ status: "read", value: true });
  });

  it("hands back the pair of numbers the limits form is about", async () => {
    stubFetch(() => serverSettings({ attachmentMaxMb: 40, attachmentTotalMb: 160 }));
    const read = await readServerSettings((settings) => ({
      maxMb: settings.attachmentMaxMb,
      totalMb: settings.attachmentTotalMb,
    }));
    expect(read).toEqual({ status: "read", value: { maxMb: 40, totalMb: 160 } });
  });

  it("answers a failed read with a sentence, not a throw", async () => {
    const fake = stubFetch(() => apiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"));
    const read = await readServerSettings((settings) => settings.agentApiEnabled);
    expect(read.status).toBe("unread");
    // Localized from the code, behind the shared lead-in — the raw message never reaches the reader.
    expect(settingsReadRefusal(read)).toBe(S.common.refused(S.errors.byCode.internal));
    expect(settingsReadRefusal(read)).not.toContain("RAW ENGLISH SERVER MESSAGE");
    expect(fake.requests.map((r) => r.path)).toEqual(["/api/admin/settings"]);
  });

  it("answers a failed read the same way when several values were asked for", async () => {
    stubFetch(() => apiError(500, "internal"));
    const read = await readServerSettings((settings) => ({
      maxMb: settings.attachmentMaxMb,
      totalMb: settings.attachmentTotalMb,
    }));
    expect(settingsReadRefusal(read)).toBe(S.common.refused(S.errors.byCode.internal));
  });

  it("speaks English when the interface does", async () => {
    setActiveStrings(EN);
    stubFetch(() => apiError(404, "not_found"));
    const read = await readServerSettings((settings) => settings.companyMode);
    expect(settingsReadRefusal(read)).toBe(EN.common.refused(EN.errors.byCode.not_found));
    expect(settingsReadRefusal(read)).not.toBe(ZH.common.refused(ZH.errors.byCode.not_found));
  });

  it("names a read that never reached the server as the client's network failure", async () => {
    stubFetch(() => {
      throw new TypeError("network down");
    });
    expect(settingsReadRefusal(await readServerSettings(() => true))).toBe(
      S.common.refused(S.errors.networkError),
    );
  });

  it("keeps a sentence the pick itself raised", () => {
    // The read lands, but taking the value out of it is the caller's code — a body without the
    // field is a bug there, and what it says is still a sentence rather than a throw.
    expect(settingsReadRefusal({ status: "unread", reason: "设置里没有这个开关" })).toBe(
      S.common.refused("设置里没有这个开关"),
    );
  });

  it("draws nothing once the value was read", () => {
    expect(settingsReadRefusal({ status: "read", value: false })).toBeNull();
  });
});
