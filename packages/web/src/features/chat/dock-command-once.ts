/**
 * The chat page's one-shot commands for the dock panel bodies ("open this file", "land on this
 * memory", "focus this child conversation" — chat-page.tsx): each is a fresh object per click,
 * held by the page until the next click, a Session switch or the panel's tab closing.
 *
 * A dock body, though, does not stay mounted: crossing the breakpoint moves its panel between
 * the side column and the narrow merged surface, and both mounts exist for the length of the
 * move, so the body that comes up is a fresh instance while the page still holds the command.
 * A per-instance guard (a ref) therefore forgets it on every remount and the command runs a
 * second time — reopening a file the reader had closed and left, pulling the Memory panel back
 * to a memory it had walked back out of.
 *
 * Module scope outlives the remount. A reload forgets everything, which is what a one-shot
 * command should do (the page keeps no command across a load either).
 */
const claimed = new WeakSet<object>();

/**
 * True the first time a given command object is seen, false on every later call — the caller
 * runs the command only on a true. The page creates a new object per click, so asking for the
 * same file again is a different command.
 */
export function claimOnce(command: object): boolean {
  if (claimed.has(command)) return false;
  claimed.add(command);
  return true;
}
