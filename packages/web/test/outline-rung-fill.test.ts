/**
 * Guard: the outline rung is never painted as a fill behind words.
 *
 * The appearance page's theme library imports themes as data. An imported theme cannot re-point
 * Tailwind's grey ramp for itself, so core's `internal/external-theme.ts` writes that bridge for
 * it and ties `--color-gray-200` to the theme's `--ui-line` — its **outline** colour. In the
 * shipped themes that step is a near-white grey (`#e5e5e5` in Primer), so `bg-gray-200` reads as
 * a fill; in the hand-drawn theme the outline is `#3f3a34` on `#fffdf7`, so the same class paints
 * a near-black block and the near-black body ink on top of it lands at about 1.06 contrast —
 * a selected row, a chip or a badge that cannot be read.
 *
 * What an element may still paint with that rung is an **inert mark**: a track, a hairline, a
 * knob, a gap or a scrollbar thumb — something that carries no words. This guard parses the real
 * JSX and fails on a `bg-gray-200` element that has text or an expression child (an expression
 * can render words; an icon child cannot). The files that keep an inert use list them in
 * {@link INERT} with the reason, and a listed use that is gone fails too, so the list cannot rot.
 *
 * Only the **light** rung is guarded. The dark halves (`dark:bg-gray-700` / `dark:bg-gray-800`)
 * carry the same defect for the same reason, and they are far more numerous; the sweep that moved
 * these call sites onto `bg-fill-neutral` / `bg-fg/N` also dropped their dark halves (a token needs
 * no per-mode twin), but the ones elsewhere are still on the grey ramp, and that remaining sweep is
 * its own pass (recorded in FORK-PROGRESS.md).
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { expectEveryRootScanned, scanSources } from "./helpers/roots";
import type { SourceFile } from "./helpers/roots";

const SCAN = scanSources([".tsx", ".ts"]);

/** The rung as a utility, whether it is plain, alpha'd (`bg-gray-200/70`) or `dark:`-prefixed. */
const RUNG = /(?<![\w-])bg-gray-200(?![\d])/;

interface Mark {
  /** `id:line <tag>` — enough to find the element again. */
  readonly where: string;
  /** Whether the element can put words on screen (a text or expression child). */
  readonly words: boolean;
}

/**
 * Inert uses the sweep left behind: rung-painted marks with no words on them. Keyed by the
 * repo-relative id a guard reports; the value says what the mark is.
 */
const INERT: Readonly<Record<string, string>> = {
  "packages/web/src/features/chat/context-gauge.tsx": "the gauge's track (its bar is a child)",
  "packages/web/src/features/chat/conversation-outline.tsx":
    "the scroll thumb (dark mode's `dark:bg-gray-200`)",
  "packages/web/src/features/chat/message-item.tsx": "the two hairlines around a divider label",
  "packages/web/src/features/company/overview-page.tsx": "the hairline grid gap between stat cells",
  "packages/web/src/features/machines/machines-page.tsx":
    "the separator hairline and the unstarted phase segment",
  "packages/web/src/features/pet/voice/call-stage.tsx": "the call's progress track",
};

/** Every string literal reachable from a node, joined: `"a b"`, `` `a ${x}` ``, `c ? "a" : "b"`. */
function literals(node: ts.Node, out: string[] = []): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
  else if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const span of node.templateSpans) out.push(span.literal.text);
  }
  ts.forEachChild(node, (child) => void literals(child, out));
  return out;
}

/** The element's `className`, in whichever form it was written. */
function classNameOf(open: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
  for (const attr of open.attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    if (!ts.isIdentifier(attr.name) || attr.name.escapedText !== "className") continue;
    if (attr.initializer !== undefined) return literals(attr.initializer).join(" ");
  }
  return "";
}

/** Whether an expression can put words on screen: `{label}`, ``{`@${who}`}``, `{on && <b/>}`. */
function mayRenderWords(node: ts.Node): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text.trim() !== "";
  }
  if (ts.isTemplateExpression(node)) return literals(node).join("").trim() !== "";
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) return false;
  if (ts.isParenthesizedExpression(node)) return mayRenderWords(node.expression);
  if (ts.isConditionalExpression(node)) {
    return mayRenderWords(node.whenTrue) || mayRenderWords(node.whenFalse);
  }
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    if (kind === ts.SyntaxKind.AmpersandAmpersandToken || kind === ts.SyntaxKind.BarBarToken) {
      return mayRenderWords(node.right);
    }
  }
  // A value this guard cannot read is treated as words: a false alarm is noisy, a missed fill
  // unreadable.
  return true;
}

/** Whether the element's own children can put words on screen (an icon child cannot). */
function carriesText(children: readonly ts.JsxChild[]): boolean {
  return children.some((child) => {
    if (ts.isJsxText(child)) return child.text.trim() !== "";
    if (ts.isJsxExpression(child))
      return child.expression !== undefined && mayRenderWords(child.expression);
    return false;
  });
}

/** The rung-painted elements in one file; `.ts` files are read as text (no JSX to parse). */
function marks(file: SourceFile): Mark[] {
  if (!file.path.endsWith(".tsx")) {
    return file.text
      .split("\n")
      .flatMap((line, i) =>
        RUNG.test(line)
          ? [{ where: `${file.id}:${i + 1} ${line.trim().slice(0, 80)}`, words: true }]
          : [],
      );
  }
  const source = ts.createSourceFile(
    file.path,
    file.text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
  const found: Mark[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = ts.isJsxElement(node) ? node.openingElement : node;
      if (RUNG.test(classNameOf(open))) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const children = ts.isJsxElement(node) ? node.children : [];
        found.push({
          where: `${file.id}:${line} <${open.tagName.getText(source)}>`,
          words: carriesText(children),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("the outline rung is not a fill", () => {
  it("every source root yields files", () => {
    expectEveryRootScanned(SCAN);
  });

  it("no unlisted element paints the rung, and no listed one puts words on it", () => {
    const offenders = SCAN.files.flatMap((file) =>
      marks(file)
        .filter((mark) => mark.words || !(file.id in INERT))
        .map((mark) => `${mark.where}${mark.words ? " (carries words)" : ""}`),
    );
    expect(
      offenders,
      "bg-gray-200 is the theme's outline rung; fill with bg-fill-neutral (or bg-fg/N)",
    ).toEqual([]);
  });

  it("keeps the exception list honest — every listed file still paints the rung", () => {
    const stale = Object.keys(INERT).filter(
      (id) => !SCAN.files.some((file) => file.id === id && marks(file).length > 0),
    );
    expect(stale, "these files no longer paint bg-gray-200; drop their INERT entries").toEqual([]);
  });
});
