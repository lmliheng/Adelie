/**
 * The call surface: everything the pet window shows while a call is open.
 *
 * It replaces the resting page (bubble, panel, penguin) for the length of the call, which is also
 * why the shell is asked to grow the window: a conversation needs a column, and the resting window
 * is sized for three tight rows. The one thing carried over is the drag — the header is still the
 * window's handle, because a window nobody can move is a window in the way.
 *
 * What it draws, in the order a person needs it: whether the other side is listening, thinking or
 * speaking (with a level meter that answers "is it hearing me"), what has been said, and the two
 * buttons that end or mute the call. The transcript is the same conversation the audio is: the
 * user's own words as they are recognized and the pet's as they are spoken, so a mis-hearing is
 * visible at the moment it happens rather than only in its answer.
 */
import { useEffect, useRef } from "react";
import { S } from "../../../lib/strings";
import { toneInk } from "../../../lib/tone";
import type { CallStatus, CallTurn } from "./types";
import type { PetCall } from "./use-pet-call";

/** The one word the stage says about the call, per state. */
const STATUS_KEY: Record<CallStatus, keyof typeof S.pet> = {
  idle: "callIdle",
  connecting: "callConnecting",
  listening: "callListening",
  thinking: "callThinking",
  speaking: "callSpeaking",
  ended: "callEnded",
  error: "callEnded",
};

export function CallStage({ call }: { call: PetCall }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  // The newest line is the one being read, so the view follows it — for the live lines as much as
  // for finished turns, since a call is watched while it is happening.
  useEffect(() => {
    const box = scroller.current;
    if (box !== null) box.scrollTop = box.scrollHeight;
  }, [call.turns, call.liveText, call.partial]);

  const live = call.active;
  const level = call.status === "speaking" ? call.outLevel : call.micLevel;
  const statusText = String(S.pet[STATUS_KEY[call.status]]);

  return (
    <div className="pet-drag flex h-screen w-screen flex-col overflow-hidden bg-transparent p-1">
      <div className="flex w-full items-center justify-between gap-1 px-1 py-0.5">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
          {S.pet.callTitle}
        </span>
        <button
          type="button"
          onClick={live ? call.hangUp : call.dismiss}
          className="pet-no-drag rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {live ? S.pet.callHangUp : S.pet.callClose}
        </button>
      </div>

      <div className="pet-no-drag flex w-full flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white/95 px-2 py-2 shadow-lg dark:border-gray-700 dark:bg-gray-900/95">
        <span className="text-xs leading-tight text-gray-600 dark:text-gray-300">{statusText}</span>
        {/* The level meter: the microphone's while the model is quiet, the reply's while it speaks.
            A meter rather than a spinner, because "is it hearing me" is the question a spoken
            interface has to answer continuously. The width is set directly and not tweened — the
            level is a measurement, and a tween would draw a level the microphone never had. */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-blue-500"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, level)) * 100)}%` }}
          />
        </div>
      </div>

      {/* The conversation. `pet-no-drag` so the column scrolls: a drag region swallows the gesture
          on the platforms whose window system delivers input to it. */}
      <div
        ref={scroller}
        className="pet-no-drag mt-1 flex-1 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-white/95 p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900/95"
      >
        {call.turns.length === 0 && call.partial === "" && call.liveText === "" && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{S.pet.callEmpty}</p>
        )}
        {call.turns.map((turn, index) => (
          <Line key={index} turn={turn} />
        ))}
        {call.partial !== "" && <Line turn={{ role: "user", text: call.partial }} />}
        {call.liveText !== "" && <Line turn={{ role: "assistant", text: call.liveText }} />}
      </div>

      {call.error !== "" && (
        <p
          role="alert"
          data-tooltip={call.error}
          data-tooltip-content="text"
          className={`mt-1 line-clamp-2 px-1 text-xs break-words ${toneInk.danger}`}
        >
          {call.error}
        </p>
      )}

      <div className="pet-no-drag mt-1 flex w-full items-center justify-center gap-2 pb-0.5">
        <button
          type="button"
          disabled={!live}
          onClick={call.toggleMute}
          className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {call.muted ? S.pet.callUnmute : S.pet.callMute}
        </button>
      </div>
    </div>
  );
}

/** One line of the transcript: who said it, and what. */
function Line({ turn }: { turn: CallTurn }) {
  const who = turn.role === "user" ? S.pet.callYou : S.pet.callPet;
  return (
    <p className="text-xs leading-snug break-words">
      <span className="mr-1 text-gray-500 dark:text-gray-400">{who}</span>
      <span className="text-gray-800 dark:text-gray-100">{turn.text}</span>
      {turn.interrupted === true && (
        <span className="ml-1 text-gray-400 dark:text-gray-500">{S.pet.callInterrupted}</span>
      )}
    </p>
  );
}
