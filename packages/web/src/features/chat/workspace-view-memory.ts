/**
 * The Files panel's own place, remembered across the move of the panel between dock surfaces
 * (a Session, or a directory — see filesScopeKey): which file is open, which folders are
 * unfolded, which directory the breadcrumbs name and uploads land in.
 *
 * The panel keeps those three in component state, and a layout move throws that state away with
 * the body: the same tab is rendered by the other dock, or by the narrow merged surface, as a
 * fresh mount where the old one stood. The reader's place went with the old mount — the file they
 * were reading, the folders they had opened on the way to it. Module scope is what survives a
 * remount: the page outlives the move, the body does not.
 *
 * A remount is not always a move, though, and only a move keeps the place. The body is also
 * mounted afresh when the tab is closed and opened again, and when the conversation is switched
 * away from and back to (the docks belong to the conversation, so its tab's body goes with it) —
 * those start the panel over, as they always have (files-switch.spec pins the Session switch).
 * What tells them apart is the surface the new body arrived on: a move lands the panel somewhere
 * else, everything else brings it back where it was. So a place is stored with the surface it was
 * left on and is restored only from a body on a different one.
 *
 * What is deliberately not here: the search box (a search is a thing you are doing, not a
 * setting), the tree's listings and the preview (the server's answers — the panel reads them back
 * on the way in), and the editor's unsaved text (unsavedDrafts, which is written through on every
 * keystroke for the same reason this is). Nor is it persisted anywhere: a place is worth keeping
 * across a move of the panel, not across a reload of the app.
 */

/** Where a panel body is drawn: the side or bottom dock, or the narrow merged surface. */
export type DockSurface = "right" | "bottom" | "merged";

export type WorkspaceView = {
  /** The surface the place was left on; the place is restored only elsewhere (see above). */
  surface: DockSurface;
  /** The file in the preview, or null while the tree is what the panel is showing. */
  selectedPath: string | null;
  /** The directory the breadcrumbs name and uploads land in. */
  currentDir: string;
  /** The unfolded directories, in the order they were opened. */
  expanded: readonly string[];
};

const views = new Map<string, WorkspaceView>();

/** A copy held apart from the caller's arrays: a record is a snapshot, not a shared object. */
const copyOf = (view: WorkspaceView): WorkspaceView => ({
  surface: view.surface,
  selectedPath: view.selectedPath,
  currentDir: view.currentDir,
  expanded: [...view.expanded],
});

/**
 * The place to come back to in this scope from a body on `surface` — null when there is none, or
 * when the body is on the surface that place was left on (a remount that is not a move).
 */
export function recallWorkspaceView(scopeKey: string, surface: DockSurface): WorkspaceView | null {
  const view = views.get(scopeKey);
  if (view === undefined || view.surface === surface) return null;
  return copyOf(view);
}

/**
 * Records where the panel is, called on every change (never on the way out: a layout move mounts
 * the arriving body before the leaving one is torn down, so an unmount-time write would land
 * after the new mount had already read the record — the ordering that keeps the composer's draft
 * in a second copy too, see subagent-composer-keep.ts).
 *
 * A place that is exactly where a fresh panel starts — no file, the root directory, nothing
 * unfolded — is dropped rather than kept: remembering "nothing" would make the panel come back
 * as if the reader had been somewhere. A body that starts over (see above) reaches this too, so
 * the place it left behind is gone rather than lying in wait for the next move.
 */
export function rememberWorkspaceView(scopeKey: string, view: WorkspaceView): void {
  if (view.selectedPath === null && view.currentDir === "" && view.expanded.length === 0) {
    views.delete(scopeKey);
    return;
  }
  views.set(scopeKey, copyOf(view));
}
