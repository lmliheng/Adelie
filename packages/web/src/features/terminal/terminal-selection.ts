/**
 * Selecting terminal text with a finger.
 *
 * xterm has no touch selection: its own touch handling is the scroll in Viewport, and
 * xterm.css turns `user-select` off for the whole surface, so the browser's own
 * press-and-hold selection cannot start either. On a phone that leaves the terminal
 * pastable and not copyable — the key bar has a paste cap and no way to make a selection
 * for a copy to take.
 *
 * So the selection has a mode of its own (the key bar's select cap, wired in
 * terminal-view.tsx): while it is on, a touch down takes the "word" under the finger and the
 * finger's travel extends it. It is a mode rather than the press-and-hold a phone reaches
 * for first because that gesture belongs to the browser — a resting press does not reach the
 * page at all (measured in Chromium: no touchmove and no touchend after one, only pointer
 * events), so a page cannot build on it.
 *
 * This module is the arithmetic that mode needs: which cells a touch takes, and what xterm's
 * `select(column, row, length)` has to be told to cover a drag.
 *
 * A word is a run of non-blank cells, the grain a terminal's own output is read at: a path,
 * a URL, a commit hash and a command are each one run. A touch that lands on blank padding
 * takes the whole line the way its text reads, which is the only thing there is to take
 * there.
 */

/** A cell in xterm's own selection coordinates: 0-based column, absolute (scrollback-inclusive) row. */
export interface BufferCell {
  col: number;
  row: number;
}

/** A run of cells in one buffer row, as a word: `start` inclusive, `end` exclusive. */
export interface WordSpan {
  start: number;
  end: number;
  row: number;
}

/** Whether the cell at `index` holds something other than a blank. */
function isText(line: string, index: number): boolean {
  if (index < 0 || index >= line.length) return false;
  return !/\s/.test(line[index]!);
}

/**
 * The word a press at `col` takes — the run of non-blank cells around it, or the line's own
 * text when the press landed on blank padding. Null for a line with nothing on it: there is
 * no selection to make, and the gesture leaves the terminal alone.
 *
 * `line` is the row's text as xterm reads it back (`translateToString(true)`, trailing
 * blanks already gone), so anything past its end is blank by definition.
 */
export function wordAt(line: string, col: number): { start: number; end: number } | null {
  if (line.trim() === "") return null;
  if (isText(line, col)) {
    let start = col;
    while (isText(line, start - 1)) start--;
    let end = col;
    while (isText(line, end + 1)) end++;
    return { start, end: end + 1 };
  }
  return { start: line.length - line.trimStart().length, end: line.length };
}

/**
 * What xterm's `select()` needs to cover the drag from a word to the finger: the earlier of
 * the two ends becomes the anchor, the later one is the selection's last cell.
 *
 * Dragging to the right of the word grows it rightwards; dragging back through it shrinks
 * it and then grows it leftwards, the way a handle on either end behaves. The rows are
 * flattened to a cell index across the row width, so a selection that runs over several
 * rows — wrapped lengths included — is one interval, which is exactly how xterm's own
 * selection model reads a range that `length` crosses.
 */
export function selectionSpan(
  word: WordSpan,
  focus: BufferCell,
  cols: number,
): { col: number; row: number; length: number } | null {
  if (cols <= 0) return null;
  const first = word.row * cols + word.start;
  const last = word.row * cols + word.end - 1;
  const at = focus.row * cols + focus.col;
  const from = Math.min(at, first);
  const to = Math.max(at, last);
  const row = Math.floor(from / cols);
  return { col: from - row * cols, row, length: to - from + 1 };
}
