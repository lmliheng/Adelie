/**
 * auditActionLabel / auditActorLabel unit tests: the device audit trail's identifier →
 * display-name mapping. Every name the server writes today renders in the reader's language in
 * both locales; the refusals (`<action>:denied` / `<action>:needs-approval`) keep the base name
 * and add why; a reported state reads as the state words the card already uses; and an
 * identifier this build has no name for falls back to the identifier itself, never to nothing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { auditActionLabel, auditActorLabel } from "../src/features/devices/audit-label";
import { setActiveStrings, zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";

afterEach(() => setActiveStrings(zh));

/** The identifiers `packages/server/src/devices/service.ts` writes as `action`. */
const NAMED = [
  "paired",
  "grant",
  "revoke",
  "grant_project",
  "revoke_project",
  "forget",
  "pair",
  "screenshot",
  "ls",
  "pull",
  "push",
  "apps",
  "install",
  "uninstall",
  "shell",
  "input",
  "notify",
  "refresh",
  "bridge_lost",
];

/** A state change is recorded with the state's own identifier. */
const STATES = ["online", "offline", "unauthorized", "pairing", "connecting"];

const LOCALES = [
  ["zh", zh],
  ["en", en],
] as const;

describe("auditActionLabel", () => {
  it("names every action the server writes, in both locales", () => {
    for (const [locale, dict] of LOCALES) {
      setActiveStrings(dict);
      for (const action of NAMED) {
        const label = auditActionLabel(action, "action");
        expect(label, `${locale} ${action}`).toBe(
          (dict.devices.audit.actions as Record<string, string>)[action],
        );
        // Naming one table entry after its identifier would read as the raw id.
        expect(label, `${locale} ${action}`).not.toBe(action);
      }
    }
  });

  it("reads a reported state as the state's own words", () => {
    for (const [locale, dict] of LOCALES) {
      setActiveStrings(dict);
      for (const state of STATES) {
        expect(auditActionLabel(state, "state"), `${locale} ${state}`).toBe(
          (dict.devices.state as Record<string, string>)[state],
        );
      }
    }
    // Chinese words them; English happens to spell several the same, which is still the card's words.
    setActiveStrings(zh);
    expect(auditActionLabel("offline", "state")).toBe("离线");
    expect(auditActionLabel("unauthorized", "state")).toBe("未授权");
  });

  it("keeps the base name on a refusal and adds why, in the reader's words", () => {
    setActiveStrings(zh);
    expect(auditActionLabel("shell:denied", "action")).toBe("执行命令（被拒绝）");
    expect(auditActionLabel("push:needs-approval", "action")).toBe("写文件（等待批准）");
    setActiveStrings(en);
    expect(auditActionLabel("shell:denied", "action")).toBe("Ran a shell command (denied)");
    expect(auditActionLabel("push:needs-approval", "action")).toBe(
      "Wrote a file (awaiting approval)",
    );
  });

  it("wraps a base name it does not know instead of dropping it", () => {
    setActiveStrings(zh);
    expect(auditActionLabel("teleport:denied", "action")).toBe("teleport（被拒绝）");
  });

  it("falls back to the raw identifier, and to the kind when no action was recorded", () => {
    setActiveStrings(zh);
    expect(auditActionLabel("battery_low", "alert")).toBe("battery_low");
    expect(auditActionLabel(null, "alert")).toBe("alert");
  });
});

describe("auditActorLabel", () => {
  it("names the system itself in both locales, and keeps a person's name as written", () => {
    setActiveStrings(zh);
    expect(auditActorLabel("system")).toBe("系统");
    expect(auditActorLabel(null)).toBe("系统");
    expect(auditActorLabel("lmliheng")).toBe("lmliheng");
    setActiveStrings(en);
    expect(auditActorLabel("system")).toBe("system");
    expect(auditActorLabel(null)).toBe("system");
  });
});
