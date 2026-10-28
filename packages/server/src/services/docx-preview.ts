/**
 * Word (.docx) → Markdown, for the Files panel's read-only preview.
 *
 * A .docx is a zip of XML parts, and the one this reads is `word/document.xml`: the body text,
 * in run order, with the paragraph and table structure the pane should show. No renderer is
 * involved and nothing is written anywhere — a preview that needs LibreOffice installed, or a
 * headless converter, would be a preview that is missing on most machines.
 *
 * What comes back is **Markdown**, not plain text, because the pane already renders Markdown with
 * its own safe pipeline: headings, list items, bold/italic runs and tables then show as the
 * document shows them, while the document's own markup stays inert text. Every literal character
 * that Markdown would otherwise read as syntax is escaped, so a line beginning with "#" in the
 * document is a line beginning with "#", not a heading.
 *
 * Limits are part of the contract, since the input is an Agent-written file: only the one part is
 * inflated, its declared size is capped before it is (a zip entry states its size, and fflate
 * allocates exactly that), the output is capped by characters, and a document that is not a .docx
 * is refused rather than guessed at.
 */
import { strFromU8, unzipSync } from "fflate";

/** The only part read: the document body. Styles, numbering, media and footnotes are ignored. */
const DOCUMENT_PART = "word/document.xml";

/** Declared uncompressed size of that part; a document body larger than this is not previewed. */
const MAX_DOCUMENT_XML_BYTES = 16 * 1024 * 1024;

/** Characters of Markdown a preview returns before it is cut short. */
export const DOCX_PREVIEW_MAX_CHARS = 200_000;

/** Thrown for anything that is not a previewable .docx: the route turns it into a 415. */
export class DocxPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxPreviewError";
  }
}

export interface DocxPreview {
  markdown: string;
  truncated: boolean;
}

/** The document body as Markdown, or a {@link DocxPreviewError} naming what was wrong. */
export function docxToMarkdown(
  archive: Uint8Array,
  maxChars = DOCX_PREVIEW_MAX_CHARS,
): DocxPreview {
  let xml: Uint8Array | undefined;
  try {
    const parts = unzipSync(archive, {
      filter: ({ name, originalSize }) => {
        if (name !== DOCUMENT_PART) return false;
        if (originalSize > MAX_DOCUMENT_XML_BYTES) {
          throw new DocxPreviewError("The document body is too large to preview.");
        }
        return true;
      },
    });
    xml = parts[DOCUMENT_PART];
  } catch (error) {
    if (error instanceof DocxPreviewError) throw error;
    // Anything fflate throws here means the bytes are not a zip at all (a renamed .doc, a
    // truncated download), which is exactly the "cannot preview this" answer.
    throw new DocxPreviewError("Not a readable .docx archive.");
  }
  if (xml === undefined) throw new DocxPreviewError("Not a Word document.");
  return { ...markdownFromDocumentXml(strFromU8(xml), maxChars) };
}

/** Escape the characters Markdown would read as syntax, so document text stays text. */
function escapeInline(text: string): string {
  return text.replace(/[\\`*_[\]<>|]/g, (char) => `\\${char}`);
}

/** A line that would open a block construct (heading, bullet, quote, numbered item) is defused. */
function escapeBlockStart(text: string): string {
  if (/^[#\-+>]/.test(text) || /^\d+[.)]/.test(text)) return `\\${text}`;
  return text;
}

/** Heading level a paragraph's own properties declare, or 0 for a normal paragraph. */
function headingLevel(style: string | null, outline: number | null): number {
  // `w:outlineLvl` is the document's own structure and wins over the style name: a heading
  // restyled in Word keeps the level the navigation pane shows.
  if (outline !== null) return Math.min(outline + 1, 6);
  if (style === null) return 0;
  if (/^title$/i.test(style)) return 1;
  const match = /^(?:heading|标题)\s*([1-9])$/i.exec(style) ?? /^([1-9])$/.exec(style);
  return match === null ? 0 : Math.min(Number(match[1]), 6);
}

/** A table as a GFM table: the first row becomes the header, as Word's own tables read. */
function tableBlock(rows: string[][]): string {
  const cells = rows.map((row) => row.map((cell) => cell.replace(/\s+/g, " ").trim()));
  const columns = Math.max(...cells.map((row) => row.length));
  const padded = cells.map((row) => [...row, ...Array<string>(columns - row.length).fill("")]);
  const line = (row: string[]): string => `| ${row.join(" | ")} |`;
  if (padded.length === 0) return "";
  if (padded.length === 1) return line(padded[0]!);
  const [head, ...rest] = padded;
  return [line(head!), `| ${head!.map(() => "---").join(" | ")} |`, ...rest.map(line)].join("\n");
}

interface Paragraph {
  parts: string[];
  style: string | null;
  outline: number | null;
  /** `w:ilvl` of a list item: 0 for the first level, higher for a nested one. */
  listLevel: number | null;
}

interface Run {
  bold: boolean;
  italic: boolean;
  text: string;
}

const TAG = /<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

/** XML text as Word wrote it: the five predefined entities and numeric references. */
function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (whole, entity: string) => {
    switch (entity.toLowerCase()) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default: {
        if (entity[0] !== "#") return whole;
        const hex = entity[1] === "x" || entity[1] === "X";
        const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
    }
  });
}

/** Attribute value of a tag's raw attribute text, e.g. `w:val` out of ` w:val="Heading1"`. */
function attr(raw: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(raw);
  return match === null ? null : (match[1] ?? match[2] ?? null);
}

/** Walks `word/document.xml` and lays its paragraphs and tables out as Markdown blocks. */
function markdownFromDocumentXml(
  xml: string,
  maxChars: number,
): { markdown: string; truncated: boolean } {
  const blocks: string[] = [];
  let used = 0;
  let truncated = false;

  const push = (block: string): boolean => {
    if (block.trim() === "") return true;
    // Only the tail is trimmed: a nested list item's leading indent is its level.
    const text = block.replace(/\s+$/, "");
    if (used + text.length > maxChars) {
      blocks.push(text.slice(0, Math.max(maxChars - used, 0)));
      used = maxChars;
      truncated = true;
      return false;
    }
    blocks.push(text);
    used += text.length + 2;
    return true;
  };

  let paragraph: Paragraph | null = null;
  let run: Run | null = null;
  let inText = false;
  let table: string[][] | null = null;
  let row: string[] | null = null;
  let cell: string[] | null = null;

  /** Emits the finished paragraph: a heading, a list item, a table cell, or plain text. */
  const endParagraph = (): void => {
    if (paragraph === null) return;
    const text = paragraph.parts.join("").trim();
    const current = paragraph;
    paragraph = null;
    if (text === "") return;
    if (cell !== null) {
      cell.push(text);
      return;
    }
    // Each run already arrived escaped (see `endRun`); only a leading marker that would open a
    // block construct is defused here. Escaping again would put backslashes inside the
    // `**bold**` markers this same function wrote.
    const level = headingLevel(current.style, current.outline);
    if (level > 0) {
      push(`${"#".repeat(level)} ${text}`);
      return;
    }
    if (current.listLevel !== null) {
      push(`${"  ".repeat(Math.min(current.listLevel, 4))}- ${text}`);
      return;
    }
    push(escapeBlockStart(text));
  };

  const endRun = (): void => {
    if (run === null) return;
    const text = decodeXml(run.text);
    const { bold, italic } = run;
    run = null;
    if (text === "" || paragraph === null) return;
    const escaped = escapeInline(text);
    if (bold && italic) paragraph.parts.push(`***${escaped}***`);
    else if (bold) paragraph.parts.push(`**${escaped}**`);
    else if (italic) paragraph.parts.push(`*${escaped}*`);
    else paragraph.parts.push(escaped);
  };

  TAG.lastIndex = 0;
  let cursor = 0;
  for (;;) {
    const match = TAG.exec(xml);
    if (match === null) break;
    if (inText && paragraph !== null && run !== null) {
      run.text += xml.slice(cursor, match.index);
    }
    cursor = TAG.lastIndex;
    const names = match as unknown as [string, string, string, string, string];
    const name = names[2];
    const attributes = names[3];
    const closing = names[1] === "/";
    const empty = names[4] === "/";
    switch (name) {
      case "w:p":
        if (closing) endParagraph();
        else if (!empty) paragraph = { parts: [], style: null, outline: null, listLevel: null };
        break;
      case "w:pStyle":
        if (paragraph !== null) paragraph.style = attr(attributes, "w:val");
        break;
      case "w:outlineLvl": {
        const value = attr(attributes, "w:val");
        if (paragraph !== null && value !== null) paragraph.outline = Number(value);
        break;
      }
      case "w:numPr":
        // Opening only: `</w:numPr>` follows the `w:ilvl` inside it and would reset the level.
        if (!closing && paragraph !== null) paragraph.listLevel = 0;
        break;
      case "w:ilvl": {
        const value = attr(attributes, "w:val");
        if (paragraph !== null && paragraph.listLevel !== null && value !== null) {
          const level = Number(value);
          if (Number.isFinite(level)) paragraph.listLevel = Math.max(level, 0);
        }
        break;
      }
      case "w:r":
        if (closing) endRun();
        else if (!empty) run = { bold: false, italic: false, text: "" };
        break;
      case "w:b":
      case "w:i": {
        if (run === null) break;
        const value = attr(attributes, "w:val");
        const on = value === null || value === "1" || value === "true";
        if (name === "w:b") run.bold = on;
        else run.italic = on;
        break;
      }
      case "w:t":
        if (closing) inText = false;
        else inText = !empty;
        break;
      case "w:tab":
      case "w:br":
      case "w:cr":
        if (run !== null) run.text += " ";
        break;
      case "w:tbl":
        if (closing) {
          if (table !== null) push(tableBlock(table));
          table = null;
        } else if (!empty) {
          endParagraph();
          table = [];
        }
        break;
      case "w:tr":
        if (closing) {
          if (table !== null && row !== null) table.push(row);
          row = null;
        } else if (!empty) row = [];
        break;
      case "w:tc":
        if (closing) {
          if (row !== null && cell !== null) row.push(cell.join(" "));
          cell = null;
        } else if (!empty) cell = [];
        break;
      default:
        break;
    }
    if (truncated) break;
  }
  // A document ending inside a paragraph (or a table) still has that last block to show.
  if (!truncated) {
    endParagraph();
    if (table !== null) push(tableBlock(table));
  }
  return { markdown: blocks.join("\n\n"), truncated };
}
