/**
 * The sidebar foot's 待做 block: the open Session's own to-do list.
 *
 * The list is not this component's — it is `TODO.json` in the Session's scratchpad, the same
 * kind of per-Session file the goal plugin keeps. The Agent writes it with its own tools as it
 * works, and this block reads it (`GET`) and writes it back (`PUT`), so the two sides see one
 * list: what the reader types here is what the Agent can pick up on its next turn, and what the
 * Agent adds while it runs shows up when the turn ends.
 *
 * Two things follow from that and shape the code:
 *
 * - **A tick must land at once.** The block edits optimistically and puts the change back if the
 *   write fails, saying so — a checkbox that silently does nothing is worse than one that admits
 *   it did not save.
 * - **The Agent may have rewritten the file.** So the list is re-read when the Session's run
 *   ends, which is when its edits are all in, and whenever the reader switches conversations.
 *   An idle Session's list is otherwise left alone: no timer runs here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SessionTodoItem } from "@adelie/server/api";
import { ChevronFlip, GlyphIcon, ICONS, Input, NavRow } from "@adelie/ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { useSessions } from "../../state/sessions";

/**
 * The list operations the block performs, as pure functions: the page's copy of the list is
 * always replaced wholesale (the PUT sends what is on screen), so these are the only three ways
 * an entry moves, and each is testable without a React tree.
 */
export function addTodo(items: readonly SessionTodoItem[], text: string): SessionTodoItem[] {
  const trimmed = text.trim();
  return trimmed === "" ? [...items] : [...items, { text: trimmed, done: false }];
}

export function toggleTodo(items: readonly SessionTodoItem[], index: number): SessionTodoItem[] {
  return items.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
}

export function removeTodo(items: readonly SessionTodoItem[], index: number): SessionTodoItem[] {
  return items.filter((_, i) => i !== index);
}

/** How many entries are still to do — the count the header shows. */
export function remainingTodos(items: readonly SessionTodoItem[]): number {
  return items.filter((item) => !item.done).length;
}

/** The Session's to-do list, kept in step with the file behind it. */
export function useSessionTodos(sessionId: string | null): {
  items: SessionTodoItem[];
  /** Which step failed — reading the list and saving it say different things. */
  failed: "read" | "write" | null;
  save: (next: SessionTodoItem[]) => void;
  reload: () => void;
} {
  const [items, setItems] = useState<SessionTodoItem[]>([]);
  const [failed, setFailed] = useState<"read" | "write" | null>(null);
  const [nonce, setNonce] = useState(0);
  const { liveStatuses } = useSessions();
  /** What the server last confirmed — where a failed edit goes back to. */
  const confirmed = useRef<SessionTodoItem[]>([]);
  /** The Session's run just ended (see the module comment): re-read rather than guess. */
  const settled = sessionId !== null && liveStatuses.get(sessionId) === "idle";

  useEffect(() => {
    if (sessionId === null) {
      setItems([]);
      setFailed(null);
      confirmed.current = [];
      return;
    }
    let cancelled = false;
    api
      .getSessionTodos(sessionId)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        confirmed.current = res.items;
        setFailed(null);
      })
      // A failed read leaves an empty list rather than a stale one from the previous Session.
      .catch(() => {
        if (!cancelled) setFailed("read");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, nonce, settled]);

  const save = (next: SessionTodoItem[]): void => {
    if (sessionId === null) return;
    setItems(next);
    setFailed(null);
    api
      .putSessionTodos(sessionId, next)
      .then((res) => {
        setItems(res.items);
        confirmed.current = res.items;
      })
      .catch(() => {
        setItems(confirmed.current);
        setFailed("write");
      });
  };

  return { items, failed, save, reload: () => setNonce((n) => n + 1) };
}

/** One entry: a tick, the text, and a way to drop it. */
function TodoRow({
  item,
  onToggle,
  onRemove,
}: {
  item: SessionTodoItem;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center gap-1.5 rounded-md px-2 py-0.5 hover:bg-fg/5">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.done ? S.account.todos.markUndone : S.account.todos.markDone}
        aria-pressed={item.done}
        className={`flex size-4 shrink-0 items-center justify-center rounded border ${
          item.done ? "border-transparent bg-accent text-accent-fg" : "border-line"
        }`}
      >
        {item.done && <GlyphIcon d={ICONS.check} size={11} />}
      </button>
      <button
        type="button"
        onClick={onToggle}
        className={`min-w-0 flex-1 truncate text-left text-xs ${
          item.done ? "text-fg-muted line-through" : "text-fg"
        }`}
      >
        {item.text}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={S.account.todos.remove}
        className="shrink-0 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <GlyphIcon d={ICONS.trash} size={13} />
      </button>
    </div>
  );
}

/**
 * The block itself: a header row that folds the list away, the entries, and the field the reader
 * adds one with. Rendered for a real Session only — a draft has no conversation to keep a list
 * for, and its id is not one the server would answer for.
 */
export function SessionTodos({ sessionId }: { sessionId: string | null }): ReactNode {
  const { items, failed, save, reload } = useSessionTodos(sessionId);
  const [draft, setDraft] = useState("");
  /** null: nobody has folded it — the list shows itself while it has entries. */
  const [folded, setFolded] = useState<boolean | null>(null);

  useEffect(() => {
    setFolded(null);
    setDraft("");
  }, [sessionId]);

  const left = useMemo(() => remainingTodos(items), [items]);
  // An empty list folds itself away, but a failure must not: a read that failed while the
  // block was empty would otherwise only be reachable by folding it open by hand.
  const open = folded === null ? items.length > 0 || failed !== null : !folded;

  if (sessionId === null) return null;

  const add = (): void => {
    const next = addTodo(items, draft);
    if (next.length === items.length) return;
    save(next);
    setDraft("");
  };

  return (
    <div className="flex flex-col">
      <NavRow
        surface="muted"
        glyph={ICONS.listChecks}
        label={S.account.todos.title}
        ariaLabel={open ? S.account.todos.collapse : S.account.todos.expand}
        onClick={() => setFolded(open)}
        badge={
          <span className="flex items-center gap-1.5 text-fg-muted">
            {items.length > 0 && (
              <span className="text-xs">{S.account.todos.count(left, items.length)}</span>
            )}
            <ChevronFlip up={open} size={11} />
          </span>
        }
      />
      {open && (
        <div className="flex flex-col gap-1 pb-1">
          {items.length === 0 && (
            <div className="px-2 py-1 text-xs text-fg-muted">{S.account.todos.empty}</div>
          )}
          {items.map((item, i) => (
            <TodoRow
              // The index is the only handle a list keeps across an Agent rewrite; entries
              // carry no id, and a key that survives a reorder matters less than the text.
              key={`${i}-${item.text}`}
              item={item}
              onToggle={() => save(toggleTodo(items, i))}
              onRemove={() => save(removeTodo(items, i))}
            />
          ))}
          {failed !== null && (
            <button
              type="button"
              onClick={reload}
              className="px-2 py-1 text-left text-xs text-tone-danger-fg"
            >
              {failed === "read" ? S.account.todos.readFailed : S.account.todos.failed} ·{" "}
              {S.account.todos.retry}
            </button>
          )}
          <div className="px-2 pt-0.5">
            <Input
              size="sm"
              value={draft}
              placeholder={S.account.todos.addPlaceholder}
              aria-label={S.account.todos.addPlaceholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
