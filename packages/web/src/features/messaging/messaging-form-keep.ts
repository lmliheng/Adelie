/**
 * What the reader had typed into the Messaging panel's binding form, remembered across the move
 * of the panel between dock surfaces (a Session, or a directory — see the panel body in
 * builtin-dock-panels.tsx).
 *
 * The form is component state (the hook in messaging-binding-editor.tsx owns it), and a layout
 * move throws it away with the body: the same tab is rendered by the other dock, or by the
 * narrow merged surface, as a fresh mount where the old one stood — the fresh mount reads the
 * bindings back from the server, which never held an unsaved edit. So a bot token pasted into
 * the panel, or an App ID typed into it, was gone after crossing the breakpoint, and the reader
 * was left retyping it. Module scope is what survives a remount: the page outlives the move,
 * the body does not.
 *
 * A remount is not always a move, though, and only a move hands the form back: the body is also
 * mounted afresh when the tab is closed and opened again, and when the conversation is switched
 * away from and back to — those start the panel over with the server's values, as they always
 * have (the dialog host passes no surface at all and so never reads this record, which keeps one
 * conversation's unsaved text from landing in the popup opened for it). What tells them apart is
 * the surface the new body arrived on: a move lands the panel somewhere else, everything else
 * brings it back where it was.
 *
 * Only a form that differs from what the server last said is kept: a form equal to its baseline
 * holds nothing the reader would miss, and remembering it would make the panel come back as if
 * they had typed something. The record is dropped then, which is also how a save (which moves
 * the baseline onto the saved values) and a body that starts over leave nothing behind.
 */

import type { MessagingFormState } from "./messaging-binding-form";
import type { DockSurface } from "../dock/panel-context";

/** The dock's own notion of a body's surface, re-exported here for this module's readers. */
export type { DockSurface };

export type KeptMessagingForm = {
  /** The surface the edits were left on; they are handed back only to a body on another one. */
  surface: DockSurface;
  form: MessagingFormState;
};

const forms = new Map<string, KeptMessagingForm>();

/**
 * The form as a fresh caller must see it: a copy, so neither side can reach into the other's
 * state. Every channel's fields are copied too — the form is a plain tree of strings, booleans
 * and numbers, which is what makes this shallow-per-channel copy exact.
 */
const copyOf = (form: MessagingFormState): MessagingFormState => ({
  channel: form.channel,
  feishu: { ...form.feishu },
  telegram: { ...form.telegram },
  qq: { ...form.qq },
  wechat: { ...form.wechat },
});

/**
 * Whether a form says the same thing as the server's last answer. Compared whole rather than
 * through `formDirty` (messaging-binding-form.ts): that one judges the SELECTED channel for the
 * Save it precedes, while this record holds whatever the reader typed into any channel — a
 * reader who filled Feishu in and then switched to QQ (dirty there: nothing) has still lost a
 * token a remount throws away.
 */
export function sameMessagingForm(a: MessagingFormState, b: MessagingFormState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The form to come back to in this conversation from a body on `surface` — null when there is
 * none, or when the body is on the surface the edits were left on (a remount that is not a move).
 */
export function recallMessagingForm(
  sessionId: string,
  surface: DockSurface,
): MessagingFormState | null {
  const kept = forms.get(sessionId);
  if (kept === undefined || kept.surface === surface) return null;
  return copyOf(kept.form);
}

/**
 * Records what the reader has typed, called on every change (never on the way out: a layout move
 * mounts the arriving body before the leaving one is torn down, so an unmount-time write would
 * land after the new mount had already read the record — the ordering the composer's draft and
 * the subagent composer keep in second copies for, see subagent-composer-keep.ts).
 */
export function rememberMessagingForm(
  sessionId: string,
  surface: DockSurface,
  form: MessagingFormState,
): void {
  forms.set(sessionId, { surface, form: copyOf(form) });
}

/** Drops the record: nothing is unsaved any more, or the body started over (see above). */
export function forgetMessagingForm(sessionId: string): void {
  forms.delete(sessionId);
}
