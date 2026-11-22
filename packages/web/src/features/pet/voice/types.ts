/**
 * The vocabulary the call is written in: the states it moves through, the two sides of its
 * transcript, and the shape of the frames its transport carries.
 */

/**
 * Where a call is. The live states are the four a call actually spends time in; `idle` is a window
 * with no call, and `ended` / `error` are the two ways one stops.
 *
 * `listening` is not "the microphone is on" — it is the model's turn to be quiet — and `thinking`
 * is the stretch between the user finishing and the first audio coming back, which is long enough
 * to need a word of its own.
 */
export type CallStatus =
  "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "error";

/** The four states in which a call is running, and the window is drawn at call size. */
export const LIVE_CALL_STATES: ReadonlySet<CallStatus> = new Set<CallStatus>([
  "connecting",
  "listening",
  "thinking",
  "speaking",
]);

/** One finished thing somebody said, in arrival order. */
export interface CallTurn {
  role: "user" | "assistant";
  text: string;
  /** The reply was cut off by the user talking over it, rather than finishing on its own. */
  interrupted?: boolean;
}

/**
 * One frame off the relay. The protocol is the provider's, so the fields are read by name where
 * they are used and an unknown `type` is ignored — a provider that adds an event must not break a
 * call that is otherwise fine.
 */
export interface RealtimeEvent {
  type: string;
  [field: string]: unknown;
}
