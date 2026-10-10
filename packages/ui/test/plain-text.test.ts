/**
 * Reading a reply as plain text: the conversation offers a copy of the reply both as the
 * Markdown it was written in and as the words alone, and this is the second one.
 *
 * What each case pins is the difference between the two copies, so the cases are the constructs
 * whose markers would otherwise land in a chat or a doc verbatim: a heading, emphasis, inline
 * and fenced code, a link, a list, a table, a quote, a rule. Two of them argue for the parser
 * rather than a substitution pass on the text and are worth keeping even if the rest is
 * rewritten: a fenced block keeps its asterisks and backticks EXACTLY (that code is the content
 * — stripping it would corrupt the one thing the reader came for), and a bare URL that
 * remark-gfm autolinked does not gain an address it already is.
 */
import { describe, expect, it } from "vitest";
import { markdownToPlainText } from "../src/components/content/prose/plain-text";

describe("markdownToPlainText", () => {
  it("takes the markers off headings and emphasis", () => {
    expect(markdownToPlainText("# Title\n\nSome **bold**, *soft* and ~~struck~~ words.")).toBe(
      "Title\n\nSome bold, soft and struck words.",
    );
    expect(markdownToPlainText("## Deeper\n\n### Deepest")).toBe("Deeper\n\nDeepest");
  });

  it("unwraps inline code but keeps a fenced block exactly as it was written", () => {
    const md = [
      "Run `npm test`, then:",
      "",
      "```sh",
      "echo '*' | grep '**bold**'   # never stripped",
      "```",
      "",
      "Done.",
    ].join("\n");
    expect(markdownToPlainText(md)).toBe(
      [
        "Run npm test, then:",
        "",
        "echo '*' | grep '**bold**'   # never stripped",
        "",
        "Done.",
      ].join("\n"),
    );
  });

  it("keeps an address behind a label, and a bare URL as the one address it is", () => {
    expect(markdownToPlainText("See [the docs](https://example.com/docs).")).toBe(
      "See the docs (https://example.com/docs).",
    );
    // remark-gfm autolinks a bare URL: its label IS the address, so it is written once.
    expect(markdownToPlainText("See https://example.com/docs for more.")).toBe(
      "See https://example.com/docs for more.",
    );
  });

  it("carries an image as its description, or as its address when it has none", () => {
    expect(markdownToPlainText("![a red swan](https://example.com/swan.png)")).toBe("a red swan");
    expect(markdownToPlainText("![](https://example.com/swan.png)")).toBe(
      "https://example.com/swan.png",
    );
  });

  it("keeps list markers, numbering and nesting as layout", () => {
    const md = ["- first", "- second", "  - nested", "", "3. three", "4. four"].join("\n");
    expect(markdownToPlainText(md)).toBe(
      ["- first", "- second", "  - nested", "", "3. three", "4. four"].join("\n"),
    );
  });

  it("writes a table a row per line", () => {
    const md = ["| Name | Size |", "| --- | --- |", "| a.md | 12 |", "| b.md | 3 |"].join("\n");
    expect(markdownToPlainText(md)).toBe(["Name | Size", "a.md | 12", "b.md | 3"].join("\n"));
  });

  it("drops the markers of a quote, and a rule with nothing behind it", () => {
    expect(markdownToPlainText("> quoted words\n> more of them\n\n---\n\nAfter.")).toBe(
      "quoted words\nmore of them\n\nAfter.",
    );
  });

  it("shows the TeX source where nothing typesets a formula, and leaves a dollar alone", () => {
    // Inline math is written `\(…\)`, not `$…$`: single-dollar math is off in the shared pipeline
    // (markdown-plugins.ts), so `$PATH` and a price stay the text they are.
    expect(markdownToPlainText("The area is \\(a^2\\) here.\n\n$$\\int_0^1 x\\,dx$$")).toBe(
      "The area is a^2 here.\n\n\\int_0^1 x\\,dx",
    );
    expect(markdownToPlainText("Set $PATH and $HOME first.")).toBe("Set $PATH and $HOME first.");
  });

  it("keeps a footnote reference with the definition's own words", () => {
    // Not a construct this product's replies lean on, but the definition carries words, and
    // dropping a node the reply wrote is the one thing this must never do.
    expect(markdownToPlainText("A claim.[^1]\n\n[^1]: The source.")).toBe(
      "A claim.[^1]\n\n[^1] The source.",
    );
  });

  it("passes raw HTML through as its own characters", () => {
    expect(markdownToPlainText("<b>kept</b> as written")).toBe("<b>kept</b> as written");
  });

  it("comes back empty when there is nothing to read", () => {
    expect(markdownToPlainText("")).toBe("");
    expect(markdownToPlainText("   \n\n  ")).toBe("");
    expect(markdownToPlainText("---")).toBe("");
    // Padding lines are scrubbed, so a copied reply never opens or closes with blank space.
    expect(markdownToPlainText("\n\n# Title\n\n\n\nBody\n\n")).toBe("Title\n\nBody");
  });
});
