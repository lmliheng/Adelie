/**
 * The sidebar foot's 待做 block: the three ways an entry moves, and the count the header shows.
 *
 * The block replaces its whole list on every edit (that is what `PUT /api/sessions/:id/todos`
 * takes), so these pure functions are the page's entire vocabulary for the list — no React tree
 * needed, and none available: this package's tests run without a DOM.
 */
import { describe, expect, it } from "vitest";
import type { SessionTodoItem } from "@adelie/server/api";
import {
  addTodo,
  removeTodo,
  remainingTodos,
  toggleTodo,
} from "../src/features/account/session-todos";

const list = (...texts: string[]): SessionTodoItem[] =>
  texts.map((text) => ({ text, done: false }));

describe("the to-do list's edits", () => {
  it("appends a trimmed entry, and adds nothing for blank input", () => {
    expect(addTodo(list("a"), "  b  ")).toEqual([
      { text: "a", done: false },
      { text: "b", done: false },
    ]);
    const before = list("a");
    expect(addTodo(before, "   ")).toEqual(before);
    // A new list either way: the caller hands the result straight to save(), which compares
    // lengths, so a blank add must not produce a different array of the same length.
    expect(addTodo(before, "  ")).not.toBe(before);
  });

  it("ticks one entry, leaving the others alone", () => {
    expect(toggleTodo(list("a", "b"), 1)).toEqual([
      { text: "a", done: false },
      { text: "b", done: true },
    ]);
    // And untick, which is the same call: the entry's own state decides the direction.
    expect(toggleTodo([{ text: "a", done: true }], 0)).toEqual([{ text: "a", done: false }]);
  });

  it("drops one entry by position, leaving the rest in order", () => {
    expect(removeTodo(list("a", "b", "c"), 1)).toEqual(list("a", "c"));
    expect(removeTodo(list("a"), 0)).toEqual([]);
  });

  it("counts what is left, not what is there", () => {
    expect(
      remainingTodos([
        { text: "a", done: true },
        { text: "b", done: false },
      ]),
    ).toBe(1);
    expect(remainingTodos([])).toBe(0);
  });
});
