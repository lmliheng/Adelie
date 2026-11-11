/**
 * A permission preset the write refused (src/features/chat/permission-refusal.ts): which words the
 * sentence above the input card uses.
 *
 * The permission button shows the pick at once and then re-reads the Session once the PATCH
 * settles, so a refusal puts the old level back and the button is the retry — the sentence is the
 * only thing saying why the press changed nothing. Three things it must get right: a server answer
 * speaks the interface's own language rather than the wire message, a write that never reached the
 * route keeps what it knows (7.19's rule), and it says out loud that the Session kept the
 * permission it had (the route writes nothing at all when it refuses).
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { permissionRefused } from "../src/features/chat/permission-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("permissionRefused", () => {
  it("reads a refusal through the code's own sentence, not the wire message", () => {
    const line = permissionRefused(new ApiError(500, "internal", "RAW ENGLISH"));
    expect(line).not.toContain("RAW ENGLISH");
    expect(line).toBe(S.chat.permissionRefused(S.errors.byCode.internal as string));
  });

  it("keeps what a write that never reached the route has to say", () => {
    expect(permissionRefused(new Error("Failed to fetch"))).toBe(
      S.chat.permissionRefused("Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(permissionRefused(undefined)).toBe(S.chat.permissionRefused(S.common.unknownError));
  });

  it("says the Session kept the permission it had", () => {
    // A non-admin loosening past the server's ceiling is the ordinary refusal of this write.
    const line = permissionRefused(new ApiError(403, "admin_required", "RAW"));
    expect(line).toBe(S.chat.permissionRefused(S.errors.byCode.admin_required as string));
    expect(line).toContain("会话仍是原来的权限");
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(permissionRefused(new Error("boom"))).toBe(
      "Could not change the permission (the Session keeps the one it had): boom",
    );
    expect(permissionRefused(new Error("boom"))).toBe(EN.chat.permissionRefused("boom"));
  });
});
