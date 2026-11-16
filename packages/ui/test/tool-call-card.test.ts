/**
 * ToolCallCard (src/components/chat/tool-call-card/tool-call-card.tsx) and the approval block it
 * holds (src/components/chat/approval-block/approval-block.tsx): the activity hook's markup, the
 * chevron named in the interface's words, and a waiting call's block — on screen while the card
 * is collapsed, with the preview, the payload and the two decisions in the caller's words.
 */
import { createElement } from "react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { ToolCallCard } from "../src/components/chat/tool-call-card/tool-call-card";
import type { ToolCallCardProps } from "../src/components/chat/tool-call-card/tool-call-card";
import { DEFAULT_UI_STRINGS, UiStringsProvider } from "../src/strings";
import { renderStatic } from "../src/testing";

const zh = { ...DEFAULT_UI_STRINGS, expand: "展开", collapse: "折叠" };
const inZh = (element: ReactElement) =>
  renderStatic(createElement(UiStringsProvider, { strings: zh }, element));

const card = (props: Partial<ToolCallCardProps>) =>
  inZh(
    createElement(ToolCallCard, {
      state: "done",
      stateLabel: "Done",
      name: "Run command",
      nameTooltip: "exec_command",
      argumentsText: '{"cmd":"ls -la"}',
      ...props,
    }),
  );

describe("ToolCallCard", () => {
  it("is a tool step for the activity hook, its name the label slot", () => {
    const html = card({ state: "running", subtitle: "List the files" });
    expect(html).toMatch(/class="ui-activity [^"]*" data-kind="tool" data-state="running"/);
    expect(html).toMatch(/data-tooltip="exec_command"[^>]*data-slot="label"[^>]*>Run command</);
    expect(html).toMatch(/data-slot="detail"[^>]*>List the files</);
    expect(html).toContain('data-slot="progress"');
  });

  it("hangs the whole path behind a shortened subtitle on it, and nothing on a subtitle shown whole", () => {
    const shortened = card({
      subtitle: "…/state/config.ts",
      subtitleFull: "/repo/src/state/config.ts",
    });
    expect(shortened).toMatch(
      /data-slot="detail" data-tooltip="\/repo\/src\/state\/config.ts" data-tooltip-content="code" data-tooltip-extra="true"[^>]*>…\/state\/config.ts</,
    );
    const whole = card({ subtitle: "List the files" });
    expect(whole).toMatch(/<span data-slot="detail" class="[^"]*">List the files</);
  });

  it("starts collapsed, its chevron named for what pressing it does", () => {
    const html = card({});
    expect(html).toContain('aria-expanded="false" aria-label="展开"');
    expect(html).not.toContain("ls -la");
  });

  it("reads a waiting call's approval as a running step, with no progress slot", () => {
    const html = card({ state: "waiting" });
    expect(html).toContain('data-state="running"');
    expect(html).not.toContain('data-slot="progress"');
  });

  it("shows a live clock with no known start as a still ellipsis", () => {
    const html = card({ state: "running", duration: { live: true } });
    expect(html).toMatch(/data-slot="detail"[^>]*>…</);
    expect(html).not.toContain("animate-pulse");
  });

  it("shows a waiting call's approval block while collapsed, in the caller's words", () => {
    const html = card({
      state: "waiting",
      pending: {
        preview: "$ ls -la",
        payload: "file_path: a.txt",
        onDecide: async () => {},
        labels: { allow: "允许", deny: "拒绝" },
      },
    });
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">$ ls -la</span>");
    expect(html).toContain("file_path: a.txt</pre>");
    expect(html).toMatch(/<button[^>]*>允许<\/button>/);
    expect(html).toMatch(/<button[^>]*>拒绝<\/button>/);
  });

  it("holds the marker or the action at the row's end, and the footer below", () => {
    expect(card({ marker: "background" })).toContain(">background</span>");
    const html = card({
      action: { label: "Send to background", hint: "Keep it running", onClick: () => {} },
      footer: "subagent row",
    });
    expect(html).toMatch(/data-tooltip="Keep it running"[^>]*>Send to background<\/button>/);
    expect(html).toContain("subagent row");
  });

  it("draws a refused action on its own line under the row, and nothing when none was refused", () => {
    const refused = "Could not send this call to the background: internal error";
    const html = card({
      state: "running",
      action: { label: "Send to background", onClick: () => {} },
      refusal: refused,
    });
    expect(html).toMatch(/role="alert"[^>]*data-testid="tool-call-refusal"/);
    expect(html).toMatch(
      /data-tooltip="Could not send this call to the background: internal error"/,
    );
    expect(html).toContain(`>${refused}</p>`);
    // The row itself is untouched: the action is still offered above the sentence.
    expect(html).toContain(">Send to background</button>");
    expect(card({})).not.toContain('data-testid="tool-call-refusal"');
  });

  it("draws a refused decision inside the approval block, above the buttons it belongs to", () => {
    const refused = "Could not hand this decision to the server; the call still waits";
    const html = card({
      state: "waiting",
      pending: {
        preview: "$ ls -la",
        onDecide: async () => {},
        labels: { allow: "允许", deny: "拒绝" },
        refusal: refused,
      },
    });
    expect(html).toMatch(/role="alert"[^>]*data-testid="approval-refusal"/);
    expect(html).toContain(`>${refused}</p>`);
    // Both buttons are still here — nothing was written, so they are the retry.
    expect(html).toMatch(/<button[^>]*>允许<\/button>/);
    expect(html).toMatch(/<button[^>]*>拒绝<\/button>/);
    // Above the buttons, not under the row: the sentence belongs to the press that stayed here.
    expect(html.indexOf('data-testid="approval-refusal"')).toBeLessThan(
      html.indexOf(">允许</button>"),
    );
  });
});
