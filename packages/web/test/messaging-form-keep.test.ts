/**
 * What the reader typed into the Messaging panel's binding form, kept per conversation across a
 * move between dock surfaces (src/features/messaging/messaging-form-keep.ts).
 *
 * A layout move remounts the panel's body on another surface, and the form lived in that body:
 * the fresh mount read the bindings back from the server and an unsaved bot token or App ID was
 * gone — measured in the browser, a panel that held two typed fields came back empty on both
 * sides of 1280 → 390 → 1280. A remount is not always a move, though: a tab closed and reopened,
 * or a conversation switched away from and back to, brings the body back on the surface the
 * edits were left on, and those still start the panel over. What this file pins is the record's
 * own rules: one form per conversation, handed back only from another surface, a form equal to
 * the server's answer kept as nothing at all, the comparison covering every channel rather than
 * the selected one, and a copy on the way in and out so no caller can reach into it.
 */
import { describe, expect, it } from "vitest";
import { emptyMessagingForm } from "../src/features/messaging/messaging-binding-form";
import type { MessagingFormState } from "../src/features/messaging/messaging-binding-form";

const typed = (patch: (form: MessagingFormState) => void): MessagingFormState => {
  const form = emptyMessagingForm();
  patch(form);
  return form;
};

describe("kept messaging form", () => {
  it("has nothing for a conversation the panel has never been in", async () => {
    const { recallMessagingForm } = await import("../src/features/messaging/messaging-form-keep");
    expect(recallMessagingForm("never-typed-into", "merged")).toBeNull();
  });

  it("hands the typed form back to a body on another surface", async () => {
    const { recallMessagingForm, rememberMessagingForm } =
      await import("../src/features/messaging/messaging-form-keep");
    const form = typed((f) => {
      f.feishu.appId = "cli_typed";
      f.feishu.appSecret = "secret-typed";
    });
    rememberMessagingForm("session:kept", "right", form);
    const back = recallMessagingForm("session:kept", "merged");
    expect(back?.feishu.appId).toBe("cli_typed");
    expect(back?.feishu.appSecret).toBe("secret-typed");
    // The rest of the form comes back as it was too, not as a fresh one.
    expect(back?.feishu.baseDomain).toBe(form.feishu.baseDomain);
  });

  it("hands back nothing to a body on the surface the edits were left on (a remount that is not a move)", async () => {
    const { recallMessagingForm, rememberMessagingForm } =
      await import("../src/features/messaging/messaging-form-keep");
    // A tab closed and opened again, or a conversation switched away from and back to: same
    // surface, and the panel starts over there as it always did.
    rememberMessagingForm(
      "session:same-surface",
      "right",
      typed((f) => (f.feishu.appId = "x")),
    );
    expect(recallMessagingForm("session:same-surface", "right")).toBeNull();
  });

  it("keeps the two surfaces apart in both directions", async () => {
    const { recallMessagingForm, rememberMessagingForm } =
      await import("../src/features/messaging/messaging-form-keep");
    rememberMessagingForm(
      "session:both-ways",
      "merged",
      typed((f) => (f.feishu.appId = "narrow")),
    );
    expect(recallMessagingForm("session:both-ways", "right")?.feishu.appId).toBe("narrow");
  });

  it("drops the record when told nothing is unsaved any more", async () => {
    const { forgetMessagingForm, recallMessagingForm, rememberMessagingForm } =
      await import("../src/features/messaging/messaging-form-keep");
    rememberMessagingForm(
      "session:saved",
      "right",
      typed((f) => (f.feishu.appId = "x")),
    );
    forgetMessagingForm("session:saved");
    expect(recallMessagingForm("session:saved", "merged")).toBeNull();
  });

  it("holds a copy: a later edit by the caller does not reach the record, nor the record the caller", async () => {
    const { recallMessagingForm, rememberMessagingForm } =
      await import("../src/features/messaging/messaging-form-keep");
    const form = typed((f) => (f.feishu.appId = "before"));
    rememberMessagingForm("session:copied", "right", form);
    form.feishu.appId = "after";
    const back = recallMessagingForm("session:copied", "merged");
    expect(back?.feishu.appId).toBe("before");
    back!.feishu.appId = "mutated";
    expect(recallMessagingForm("session:copied", "merged")?.feishu.appId).toBe("before");
  });

  it("compares the whole form, not the selected channel: a filled Feishu form counts while QQ is selected", async () => {
    const { sameMessagingForm } = await import("../src/features/messaging/messaging-form-keep");
    const stored = emptyMessagingForm();
    const edited = emptyMessagingForm();
    edited.channel = "qq";
    edited.feishu.appSecret = "pasted-then-switched-away";
    // The Save would judge QQ (dirty there: nothing) — the record holds what was typed anywhere.
    expect(sameMessagingForm(edited, stored)).toBe(false);
    // An untouched pair is the same tree, whatever the form starts as.
    expect(sameMessagingForm(emptyMessagingForm(), emptyMessagingForm())).toBe(true);
  });
});
