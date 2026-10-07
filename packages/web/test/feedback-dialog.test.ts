/**
 * The feedback entry's dialog (components/account/feedback-dialog.tsx), rendered to static
 * markup: vitest runs node-only here, so no click ever reaches a handler. What is checkable is
 * what the dialog offers — two fields, the title the only one it insists on, and the caps the
 * endpoint applies so an over-long title is refused here rather than at the far end — and the
 * one decision its failure path makes.
 *
 * The dialog hangs off the account menu (user-menu.tsx), which mounts it outside the panel: the
 * panel's children unmount the moment the menu closes, and the row closes the menu as it opens
 * this. A closed dialog therefore has to render nothing at all, which is the first case here.
 *
 * The Modal is a body portal, which the server renderer refuses and which node has no document
 * for: `createPortal` is mocked to render in place (the ui package's own tests do the same), and
 * `document`/`HTMLElement` stand in for the `document.activeElement` the dialog reads as it
 * renders. Effects never run here, so this is exactly the markup.
 */
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import { FeedbackDialog, feedbackErrorMessage } from "../src/components/account/feedback-dialog";
import { S, setActiveStrings, zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  createPortal: (node: ReactNode) => node,
}));

const noop = () => {};

const render = (open: boolean) =>
  renderToStaticMarkup(createElement(FeedbackDialog, { open, onClose: noop }));

beforeEach(() => {
  vi.stubGlobal("document", { body: {}, activeElement: null });
  vi.stubGlobal("HTMLElement", class {});
});

afterEach(() => {
  setActiveStrings(zh);
});

describe("FeedbackDialog", () => {
  it("draws nothing while it is closed, so the menu can mount it unconditionally", () => {
    expect(render(false)).toBe("");
  });

  it("asks for a title and an optional detail, in the interface's own words", () => {
    const html = render(true);
    expect(html).toContain(S.feedback.intro);
    expect(html).toContain(S.feedback.titleLabel);
    expect(html).toContain(S.feedback.titlePlaceholder);
    expect(html).toContain(S.feedback.detailLabel);
    expect(html).toContain(S.feedback.detailPlaceholder);
    expect(html).toContain(S.feedback.submit);
    expect(html).toContain(S.common.cancel);
  });

  it("marks the title field, and only it, as required", () => {
    const html = render(true);
    // The red "*" is the only thing that says a field is required (test/required-mark.test.ts) —
    // which is exactly why the detail's row carries no counterpart mark.
    expect(html.match(/text-tone-danger-fg/g)).toHaveLength(1);
    expect(html).toMatch(
      new RegExp(
        `${S.feedback.titleLabel}<span class="ml-0.5 text-tone-danger-fg"[^>]*>\\*</span>`,
      ),
    );
  });

  it("caps both fields at the endpoint's own limits, sparing the round trip", () => {
    const html = render(true);
    expect(html).toContain('maxLength="200"');
    expect(html).toContain('maxLength="20000"');
  });

  it("opens with Send unavailable: an empty title is the one thing the endpoint refuses", () => {
    const html = render(true);
    // The disabled attribute itself, not the `disabled:` variant every Button's classes spell out
    // whether it is disabled or not.
    const button = (label: string) =>
      [...html.matchAll(/<button\b[^>]*>[^<]*<\/button>/g)]
        .map((m) => m[0])
        .find((b) => b.endsWith(`>${label}</button>`)) ?? "";
    expect(button(S.feedback.submit)).toContain('disabled=""');
    // Cancel stays available — a dialog that traps a user with nothing to send is worse.
    expect(button(S.common.cancel)).not.toContain('disabled=""');
  });

  it("speaks English when the interface does", () => {
    setActiveStrings(en);
    const html = render(true);
    expect(html).toContain(en.feedback.titleLabel);
    expect(html).toContain(en.feedback.submit);
    expect(html).not.toContain(zh.feedback.titleLabel);
    expect(html).not.toContain(zh.feedback.submit);
  });
});

describe("feedbackErrorMessage", () => {
  it("names the operator's switch when that is what the server answered", () => {
    // The one code the dialog treats differently: the endpoint was turned off under an open
    // dialog, which is the operator's doing and not a network the user could retry.
    expect(feedbackErrorMessage(new ApiError(503, "feedback_not_configured", "nope"))).toBe(
      S.feedback.notConfigured,
    );
  });

  it("gives every other failure the same retryable sentence", () => {
    expect(feedbackErrorMessage(new ApiError(502, "feedback_rejected", "nope"))).toBe(
      S.feedback.sendFailed,
    );
    expect(feedbackErrorMessage(new ApiError(400, "bad_request", "nope"))).toBe(
      S.feedback.sendFailed,
    );
    // Not even an ApiError — a thrown string must not reach the user as one.
    expect(feedbackErrorMessage("boom")).toBe(S.feedback.sendFailed);
  });
});
