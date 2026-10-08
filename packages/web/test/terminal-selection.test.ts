/**
 * The touch selection's arithmetic (terminal-selection.ts): which cells a long press takes,
 * and the `select(col, row, length)` a drag from there asks xterm for.
 */
import { describe, expect, it } from "vitest";
import { selectionSpan, wordAt } from "../src/features/terminal/terminal-selection";

const COLS = 10;

describe("wordAt", () => {
  it("takes the run of non-blank cells the press landed in", () => {
    // "root@host:~# echo SELECT_ME" — the prompt, a command and its argument.
    expect(wordAt("root@host:~# echo SELECT_ME", 20)).toEqual({ start: 18, end: 27 });
  });

  it("keeps punctuation with the word — a path, a URL, a hash are each one run", () => {
    const line = "  /usr/local/bin/node:12:5  ";
    expect(wordAt(line, 10)).toEqual({ start: 2, end: 26 });
  });

  it("takes the whole word from either of its edges", () => {
    const line = "alpha beta";
    expect(wordAt(line, 0)).toEqual({ start: 0, end: 5 });
    expect(wordAt(line, 4)).toEqual({ start: 0, end: 5 });
    expect(wordAt(line, 6)).toEqual({ start: 6, end: 10 });
    expect(wordAt(line, 9)).toEqual({ start: 6, end: 10 });
  });

  it("falls back to the line's own text when the press lands on blank padding", () => {
    // What xterm reads back: trailing blanks are already gone.
    expect(wordAt("SELECT_ME_LINE", 20)).toEqual({ start: 0, end: 14 });
    expect(wordAt("   indented tail", 0)).toEqual({ start: 3, end: 16 });
  });

  it("has nothing to take on a blank line", () => {
    expect(wordAt("", 0)).toBeNull();
    expect(wordAt("      ", 3)).toBeNull();
  });
});

describe("selectionSpan", () => {
  it("extends the word to the finger, the finger's own cell included", () => {
    const word = { start: 2, end: 5, row: 3 }; // cells 2..4 of row 3
    expect(selectionSpan(word, { col: 7, row: 3 }, COLS)).toEqual({ col: 2, row: 3, length: 6 });
  });

  it("a drag that stays inside the word keeps the word the press took", () => {
    const word = { start: 2, end: 6, row: 0 };
    expect(selectionSpan(word, { col: 3, row: 0 }, COLS)).toEqual({ col: 2, row: 0, length: 4 });
  });

  it("a drag to the left of the word anchors at the finger and ends at the word's last cell", () => {
    const word = { start: 4, end: 7, row: 1 };
    expect(selectionSpan(word, { col: 1, row: 1 }, COLS)).toEqual({ col: 1, row: 1, length: 6 });
  });

  it("carries a selection across rows as one interval, the way xterm reads it", () => {
    const word = { start: 8, end: 10, row: 2 }; // cells 28..29
    // Down one row and back to column 2: the selection runs to cell 32.
    expect(selectionSpan(word, { col: 2, row: 3 }, COLS)).toEqual({ col: 8, row: 2, length: 5 });
  });

  it("has no span for a grid it cannot flatten", () => {
    expect(selectionSpan({ start: 0, end: 1, row: 0 }, { col: 0, row: 0 }, 0)).toBeNull();
  });
});
