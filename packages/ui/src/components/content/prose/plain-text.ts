/**
 * Reading a Markdown reply as plain text — what the conversation's 「复制纯文本」 puts on the
 * clipboard, next to the same reply copied as Markdown.
 *
 * Why the two differ at all: the reply on screen is typeset — a heading is bigger, `**this**` is
 * bold, `- item` is a bullet — and pasting the SOURCE into a chat, a ticket or a doc hands the
 * reader the punctuation instead (`## `, `**`, `| --- |`). Plain text is for that destination:
 * the words, with the structure kept as layout rather than as markers.
 *
 * It reads the SAME tree the transcript renders (the dialect lives in markdown-plugins.ts, so a
 * construct the renderer typesets is a construct this knows how to unwrap), and it walks that
 * tree the way the channel renderers walk theirs — one branch per node type, no substitution
 * pass over the text.
 *
 * Kept, because dropping any of them would lose something the reply deliberately carried:
 *
 *   - a list item's bullet or number, and its nesting as an indent;
 *   - a link's address, when its label does not already read as the address (a bare URL that
 *     remark-gfm autolinked arrives with the two equal, and keeps just the one);
 *   - an image's alt text — or its address when it has none: a picture cannot travel as text,
 *     and the reply's own pictures are files the transcript carries outside the body;
 *   - a fenced block's code, verbatim and unfenced (the fence is markup; the code is content);
 *   - a table's cells, row by row;
 *   - a footnote reference as `[^id]`, with the definition's own words where it was written.
 *
 * Dropped, because each one only ever told the renderer what to draw: the `#` of a heading, the
 * emphasis / strong / strikethrough markers, backticks, the `>` of a blockquote, a thematic
 * break (a rule has nothing to say as text), front matter, and a link definition, whose address
 * already travels with the label referring to it.
 *
 * Raw HTML passes through as its own characters: it is text the author wrote, and stripping tags
 * would silently delete whatever sat between them.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import type {
  BlockContent,
  DefinitionContent,
  ListItem,
  PhrasingContent,
  RootContent,
  TableRow,
} from "mdast";
import { REMARK_PLUGINS } from "./markdown-plugins";

/**
 * One processor for the whole app: `unified` compiles its extension lists on first use, and a
 * fresh one per copy would redo that work. Parsing is stateless, so one instance serves every
 * copy.
 */
const processor = unified().use(remarkParse).use(REMARK_PLUGINS);

/** One nesting step inside a list, as a reading indent — layout, not syntax. */
const INDENT = "  ";

/** What a list marks its items with: a bullet, or the number counted from the list's own start. */
function marker(list: { ordered?: boolean | null; start?: number | null }, index: number): string {
  return list.ordered ? `${(list.start ?? 1) + index}. ` : "- ";
}

/** Inline content as text: the words, with nothing that only marked them up. */
function inline(nodes: PhrasingContent[]): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
      case "inlineCode":
        out += node.value;
        break;
      case "strong":
      case "emphasis":
      case "delete":
        out += inline(node.children);
        break;
      case "link": {
        // The label, plus the address behind it only when the label does not already read as
        // that address.
        const label = inline(node.children);
        out += label === node.url ? label : `${label} (${node.url})`;
        break;
      }
      case "image":
        out += node.alt ? node.alt : node.url;
        break;
      case "break":
        out += "\n";
        break;
      case "inlineMath":
        // The TeX source is the readable form once nothing typesets it.
        out += node.value;
        break;
      case "html":
        out += node.value;
        break;
      case "footnoteReference":
        out += `[^${node.identifier}]`;
        break;
      case "linkReference":
      case "imageReference":
        out += "children" in node ? inline(node.children) : (node.label ?? node.identifier);
        break;
      default:
        break;
    }
  }
  return out;
}

/** A table row: its cells, in order, on one line. */
function tableRow(row: TableRow): string {
  return row.children.map((cell) => inline(cell.children)).join(" | ");
}

/** One block as its own lines: trailing blanks scrubbed, the indent it was drawn at kept. */
function trimmed(text: string): string {
  return text.replace(/[ \t]+$/gm, "").replace(/^\n+|\n+$/g, "");
}

/**
 * One list item: its marker at the list's own indent, then its blocks on the following lines.
 * They are joined with a single newline rather than a blank line — a blank line inside an item
 * would read as the item ending, which is exactly where a nested list has to stay put.
 */
function listItem(item: ListItem, depth: number, mark: string): string {
  const parts = item.children
    .map((child) => block(child, depth + 1))
    .map(trimmed)
    .filter((text) => text !== "");
  return `${INDENT.repeat(depth)}${mark}${parts.join("\n")}`;
}

/**
 * Block content as text. `depth` is the list nesting it sits at, and only list rendering reads
 * it: a paragraph, a heading, a table row and a code block are the same text wherever they
 * appear.
 */
function block(node: BlockContent | DefinitionContent | RootContent, depth: number): string {
  const pad = INDENT.repeat(depth);
  switch (node.type) {
    case "paragraph":
      // Continuation lines of a wrapped paragraph line up under its first line, so a paragraph
      // inside a list item stays visually part of that item.
      return inline(node.children).split("\n").join(`\n${pad}`);
    case "heading":
      return inline(node.children);
    case "code":
      return node.value.replace(/\n$/, "");
    case "math":
      return node.value;
    case "blockquote":
      return children(node.children, depth);
    case "list":
      return node.children
        .map((item, index) => listItem(item, depth, marker(node, index)))
        .join("\n");
    case "table":
      return node.children.map(tableRow).join("\n");
    case "footnoteDefinition":
      return `[^${node.identifier}] ${children(node.children, depth)}`;
    case "html":
      return node.value;
    // A rule, front matter, a link definition, and anything a later dialect adds carry nothing a
    // reader needs.
    case "thematicBreak":
    case "definition":
    case "yaml":
      return "";
    default:
      return "";
  }
}

/** Several blocks as text, blank-line separated — the shape every container here joins in. */
function children(
  nodes: (BlockContent | DefinitionContent | RootContent)[],
  depth: number,
): string {
  return nodes
    .map((node) => block(node, depth))
    .map(trimmed)
    .filter((text) => text !== "")
    .join("\n\n");
}

/**
 * A reply (or any Markdown) as plain text. Never throws — every string is a valid document — and
 * a document with nothing readable in it (blank space, a single rule) comes back empty, which
 * the caller reads as "there is nothing to copy".
 */
export function markdownToPlainText(markdown: string): string {
  const tree = processor.parse(markdown);
  return tree.type === "root"
    ? children(tree.children, 0)
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : "";
}
