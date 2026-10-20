/**
 * ConfirmModal (src/components/overlays/confirm-modal/confirm-modal.tsx): the headerless confirm
 * card. Both labels are the caller's copy, the optional third choice needs both halves to appear,
 * `confirmDisabled` holds back the confirm button alone, and the tone rides on the mark's ink over
 * a neutral disc — never an icon in a tint of its own tone. A refused write reports its words in
 * `refusal`, drawn inside the card so the reason sits beside the retry button.
 */
import { createElement } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmModal } from "../src/components/overlays/confirm-modal/confirm-modal";
import type { ConfirmModalProps } from "../src/components/overlays/confirm-modal/confirm-modal";
import { classTokens, renderStatic } from "../src/testing";
import { stubDialogGlobals } from "./helpers/dialog-env";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  createPortal: (node: ReactNode) => node,
}));
stubDialogGlobals();

const noop = () => {};
const confirm = (props: Partial<ConfirmModalProps> = {}) =>
  renderStatic(
    createElement(ConfirmModal, {
      open: true,
      title: "Delete this session?",
      onClose: noop,
      onConfirm: noop,
      confirmLabel: "Delete",
      cancelLabel: "Keep it",
      children: "The transcript goes with it.",
      ...props,
    }),
  );

/** The rendered buttons' texts, in order. */
const buttons = (html: string) =>
  [...html.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);

describe("ConfirmModal", () => {
  it("is a headerless dialog named by its title", () => {
    const html = confirm();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Delete this session?"');
    expect(html).not.toContain("<h2");
    expect(html).toContain("The transcript goes with it.");
  });

  it("labels both buttons with the caller's copy, cancel first", () => {
    expect(buttons(confirm())).toEqual(["Keep it", "Delete"]);
  });

  it("adds the third choice between them only when it has both a label and a handler", () => {
    expect(buttons(confirm({ secondaryLabel: "Switch anyway" }))).toEqual(["Keep it", "Delete"]);
    expect(buttons(confirm({ secondaryLabel: "Switch anyway", onSecondary: noop }))).toEqual([
      "Keep it",
      "Switch anyway",
      "Delete",
    ]);
  });

  it("holds back the confirm button alone while its action is unavailable, all while busy", () => {
    const disabled = (html: string) =>
      [...html.matchAll(/<button\b[^>]*>/g)].filter((m) => m[0].includes('disabled=""')).length;
    expect(disabled(confirm())).toBe(0);
    expect(disabled(confirm({ confirmDisabled: true }))).toBe(1);
    expect(disabled(confirm({ busy: true }))).toBe(2);
  });

  it("carries the tone in the mark's ink, on the same neutral disc for both tones", () => {
    const mark = (html: string) =>
      classTokens(/<span aria-hidden="true"[^>]*>/.exec(html)?.[0] ?? "");
    const danger = mark(confirm());
    expect(danger).toEqual(expect.arrayContaining(["bg-line-muted", "text-tone-danger-fg"]));
    expect(danger.filter((t) => t.startsWith("bg-tone-"))).toEqual([]);
    const primary = mark(confirm({ tone: "primary" }));
    expect(primary).toEqual(expect.arrayContaining(["bg-line-muted", "text-tone-neutral-fg"]));
    expect(primary).not.toContain("text-tone-danger-fg");
  });

  /**
   * A refused write's words are the card's own: a danger notice under the sentence, in the body
   * column beside the mark (not a second floating card), and nothing at all when none was given.
   */
  it("draws a refusal inside the card, and no slot at all when there is none", () => {
    expect(confirm()).not.toContain("ui-notice");
    expect(confirm({ refusal: "" })).toContain("ui-notice");

    const html = confirm({ refusal: "models store is closed" });
    const strip = /<div role="alert"[^>]*>/.exec(html)?.[0] ?? "";
    expect(classTokens(strip)).toEqual(
      expect.arrayContaining(["ui-notice", "bg-tone-danger-bg", "text-tone-danger-fg", "mt-3"]),
    );
    expect(html).toContain("models store is closed");
    // Under the caller's sentence: the body column reads sentence, then the refusal.
    expect(html.indexOf("The transcript goes with it.")).toBeLessThan(
      html.indexOf("models store is closed"),
    );
    // The slot the notice hook lets a theme restyle the words through, and no mark of its own.
    expect(strip).toContain('data-tone="danger"');
    expect(html).toContain('data-slot="body"');
  });
});
