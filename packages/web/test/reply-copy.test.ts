/**
 * A reply's footer carries TWO copy actions (react-dom/server static markup, node env, no DOM):
 * the reply as the Markdown it was written in (the copy glyph, as before), and the same words as
 * plain text (its own glyph — three lines — since two copy icons side by side would name
 * neither). The plain-text one appears only when there is a reply body to strip; with nothing
 * said yet there is no second copy to offer, and the first falls back to the turn's stats.
 *
 * What each button hands the clipboard is decided at click time through the ui package's
 * CopyButton, and markdownToPlainText's own rules are pinned in the ui package's
 * plain-text.test.ts; the click itself is driven in the real browser by
 * e2e/reply-copy-plain.spec.mjs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ICONS } from "@adelie/ui";
import { TaskStatsLine } from "../src/features/chat/task-stats-line";
import { S, setActiveStrings, zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";

// The theme and locale contexts throw outside their providers, and this footer reads a currency
// and a locale out of them; only the strings it draws matter here.
vi.mock("../src/state/theme", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/state/theme")>()),
  useTheme: () => ({ currency: "USD" }),
}));
vi.mock("../src/state/locale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/state/locale")>()),
  useLocale: () => ({ locale: "zh" }),
}));

const REPLY = "## 结论\n\n**可以发了**。\n\n| 项 | 值 |\n| --- | --- |\n| 版本 | 0.3.6 |";

const footer = (assistantText: string) =>
  renderToStaticMarkup(createElement(TaskStatsLine, { stats: null, assistantText }));

/** One button's markup, up to its closing tag. */
function buttonFor(html: string, label: string): string {
  const at = html.indexOf(`aria-label="${label}"`);
  expect(at).toBeGreaterThan(-1);
  return html.slice(at, html.indexOf("</button>", at));
}

afterEach(() => setActiveStrings(zh));

describe("the reply footer's copy actions", () => {
  it("offers the reply as Markdown, and beside it as plain text", () => {
    const html = footer(REPLY);
    const markdown = buttonFor(html, S.chat.copyReply);
    const plain = buttonFor(html, S.chat.copyReplyPlain);

    // Told apart by their marks, since neither button says anything on screen.
    expect(markdown).toContain(`d="${ICONS.copy}"`);
    expect(plain).toContain(`d="${ICONS.textLines}"`);
    expect(plain).not.toContain(`d="${ICONS.copy}"`);
    // Markdown first: the familiar action keeps its spot at the row's end.
    expect(html.indexOf(`aria-label="${S.chat.copyReply}"`)).toBeLessThan(
      html.indexOf(`aria-label="${S.chat.copyReplyPlain}"`),
    );
  });

  it("leaves the plain-text copy out when the turn said nothing", () => {
    const html = footer("");
    expect(html).toContain(`aria-label="${S.chat.copyReply}"`);
    expect(html).not.toContain(S.chat.copyReplyPlain);
  });

  it("names both actions in the interface's language", () => {
    setActiveStrings(en);
    const html = footer(REPLY);
    expect(html).toContain(`aria-label="${en.chat.copyReply}"`);
    expect(html).toContain(`aria-label="${en.chat.copyReplyPlain}"`);
  });
});
