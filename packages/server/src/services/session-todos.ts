/**
 * A Session's to-do list: `TODO.json` in its scratchpad — the file the Agent keeps (its default
 * instructions say so), the sidebar's 待做 block renders, and the reader edits through
 * `PUT /api/sessions/:sessionId/todos`. It follows the goal plugin's `GOAL.json`: a JSON file in
 * the Session's scratchpad, written by the model and read by the server, so both sides work on
 * one list rather than two that drift.
 *
 * The file is **agent-writable**, so nothing read out of it is trusted. An entry that is not a
 * `{ text, done }` pair is dropped, and a text past the cap is cut rather than refused — the
 * model's own writing must never turn a read into a 500, and a page that cannot render the list
 * is worse than one showing a shortened entry.
 */
import path from "node:path";
import { sessionScratchpadDir } from "@adelie/core";
import type { SessionTodoItem } from "../api/types.js";

/** How many entries one list may hold. */
export const MAX_TODO_ITEMS = 200;
/** How many characters one entry's text may keep. */
export const MAX_TODO_TEXT = 500;

/** `<scratchpad>/<sessionId>/TODO.json` — the Session's to-do list. */
export function todosFilePath(
  root: string,
  projectId: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(sessionScratchpadDir(root, projectId, agentId, sessionId), "TODO.json");
}

/** One entry, whatever came out of the file, or null when it is not an entry at all. */
function entryOf(value: unknown): SessionTodoItem | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.text !== "string") return null;
  const text = item.text.trim();
  if (text === "") return null;
  return { text: text.slice(0, MAX_TODO_TEXT), done: item.done === true };
}

/** The entries a `TODO.json` holds, or [] for anything that is not that file. */
export function parseTodos(raw: string): SessionTodoItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== "object") return [];
  const items = (parsed as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  const out: SessionTodoItem[] = [];
  for (const value of items) {
    const entry = entryOf(value);
    if (entry !== null) out.push(entry);
    if (out.length >= MAX_TODO_ITEMS) break;
  }
  return out;
}

/** The file's bytes for a list: what the page and the model both read back. */
export function serializeTodos(items: readonly SessionTodoItem[]): string {
  return `${JSON.stringify({ items }, null, 2)}\n`;
}

/**
 * A client's `items` field, normalized for storage. A list longer than the cap is a 400 rather
 * than a silent truncation: the page sent it, so it is the page's bug to fix, and a list that
 * quietly loses entries is exactly the surprise this feature is meant to remove. Text is trimmed
 * and capped here too — the same reading the parser applies to the file.
 */
export function normalizeTodosInput(value: unknown): SessionTodoItem[] {
  if (!Array.isArray(value)) throw new Error("items must be an array.");
  if (value.length > MAX_TODO_ITEMS) {
    throw new Error(`items must hold at most ${MAX_TODO_ITEMS} entries.`);
  }
  const out: SessionTodoItem[] = [];
  for (const [i, raw] of value.entries()) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`items[${i}] must be an object.`);
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.text !== "string") throw new Error(`items[${i}].text must be a string.`);
    const text = item.text.trim();
    if (text === "") throw new Error(`items[${i}].text must not be empty.`);
    if (text.length > MAX_TODO_TEXT) {
      throw new Error(`items[${i}].text must be at most ${MAX_TODO_TEXT} characters.`);
    }
    if (item.done !== undefined && typeof item.done !== "boolean") {
      throw new Error(`items[${i}].done must be a boolean.`);
    }
    out.push({ text, done: item.done === true });
  }
  return out;
}
