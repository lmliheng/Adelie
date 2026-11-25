/**
 * The call surface: everything the pet window shows while a call is open.
 *
 * It replaces the resting page (bubble, panel, penguin) for the length of the call, which is also
 * why the shell is asked to grow the window: a conversation needs a column, and the resting window
 * is sized for three tight rows. The one thing carried over is the drag — the header is still the
 * window's handle, because a window nobody can move is a window in the way.
 *
 * WHAT IT IS is a conversation with the pet, not a status readout: the pet's own figure heads it
 * and stands beside everything the pet says, the two speakers' words are bubbles on their own
 * sides, and the call's one gesture — hang up, or mute the microphone — sits in a control bar at
 * the foot the way every phone puts it. The states read the same way they are heard: the pet is
 * thinking (three dots in its bubble), listening (the meter answers "is it hearing me"), or
 * speaking (the meter is the reply's, and the avatar pulses with it).
 *
 * The transcript is the same conversation the audio is: the user's own words as they are
 * recognized and the pet's as they are spoken, so a mis-hearing is visible at the moment it happens
 * rather than only in its answer.
 */
import { useEffect, useRef } from "react";
import type { CSSProperties, ReactElement } from "react";
import { CloseIcon, GlyphIcon, ICONS } from "@adelie/ui";
import { S } from "../../../lib/strings";
import { toneInk } from "../../../lib/tone";
import { usePetFigure } from "../../../lib/use-pet-figure";
import { PET_FIGURE_VIEWS } from "../figures";
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
  const speaking = call.status === "speaking";
  const level = speaking ? call.outLevel : call.micLevel;
  const statusText = String(S.pet[STATUS_KEY[call.status]]);
  const thinking = call.status === "thinking" && call.liveText === "";

  return (
    <div className="pet-drag pet-in flex h-screen w-screen flex-col overflow-hidden bg-transparent p-1.5 text-gray-800 dark:text-gray-100">
      <header className="pet-no-drag flex items-center gap-2 px-0.5">
        <PetAvatar live={speaking} level={level} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{S.pet.callPet}</div>
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">{statusText}</div>
        </div>
        {/* The way out once the call is over. During a call the way out is the hang-up below, so
            this is drawn only when there is no call left to end. */}
        {!live && (
          <button
            type="button"
            onClick={call.dismiss}
            aria-label={S.pet.callClose}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <CloseIcon size={12} />
          </button>
        )}
      </header>

      {/* The level meter: the microphone's while the model is quiet, the reply's while it speaks.
          A meter rather than a spinner, because "is it hearing me" is the question a spoken
          interface has to answer continuously. The width is set directly and not tweened — the
          level is a measurement, and a tween would draw a level the microphone never had. */}
      <div className="pet-no-drag mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-200/80 dark:bg-gray-700/60">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, level)) * 100)}%` }}
        />
      </div>

      {/* The conversation. `pet-no-drag` so the column scrolls: a drag region swallows the gesture
          on the platforms whose window system delivers input to it. */}
      <div
        ref={scroller}
        className="pet-no-drag mt-1.5 flex-1 space-y-1.5 overflow-y-auto rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900/95"
      >
        {call.turns.length === 0 && call.partial === "" && call.liveText === "" && !thinking && (
          <p className="px-1 py-2 text-center text-xs text-gray-500 dark:text-gray-400">
            {S.pet.callEmpty}
          </p>
        )}
        {call.turns.map((turn, index) => (
          <Bubble key={index} turn={turn} />
        ))}
        {call.partial !== "" && <Bubble turn={{ role: "user", text: call.partial }} dim />}
        {call.liveText !== "" && <Bubble turn={{ role: "assistant", text: call.liveText }} dim />}
        {thinking && <ThinkingBubble />}
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

      {/* The control bar: every call's two gestures, at the foot where a hand expects them. */}
      <div className="pet-no-drag mt-1.5 flex items-center justify-center gap-4 pb-0.5">
        {live ? (
          <>
            <button
              type="button"
              onClick={call.toggleMute}
              aria-label={call.muted ? S.pet.callUnmute : S.pet.callMute}
              aria-pressed={call.muted}
              className={`grid h-10 w-10 place-items-center rounded-full shadow-sm transition-colors ${
                call.muted
                  ? "bg-accent text-accent-fg"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              <GlyphIcon d={call.muted ? ICONS.microphoneOff : ICONS.microphone} size={17} />
            </button>
            <button
              type="button"
              onClick={call.hangUp}
              aria-label={S.pet.callHangUp}
              className="grid h-10 w-10 place-items-center rounded-full bg-tone-danger-emphasis text-tone-danger-emphasis-fg shadow-sm transition-opacity hover:opacity-90 active:opacity-80"
            >
              {/* The handset, turned on its head: the mark everyone reads as "end it". */}
              <GlyphIcon d={ICONS.phone} size={18} className="rotate-[135deg]" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={call.dismiss}
            className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs text-gray-600 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {S.pet.callClose}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The pet's own figure in a round frame — the header's avatar and the one beside each of its
 * bubbles, so the words come from the figure on the desktop rather than from an anonymous window.
 * It pulses while the pet speaks, and the pulse is the level: `/pet`'s figure is whichever one the
 * reader chose (lib/pet-figure.ts), so a drawing and a picture both sit in the frame.
 */
function PetAvatar({
  live = false,
  level = 0,
  className = "",
}: {
  live?: boolean;
  level?: number;
  className?: string;
}) {
  const [figure] = usePetFigure();
  const Figure = PET_FIGURE_VIEWS[figure];
  return (
    <span
      className={`pet-avatar grid shrink-0 place-items-center overflow-hidden rounded-full border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 ${className}`}
      style={{ "--pet-level": String(Math.min(1, Math.max(0, level))) } as CSSProperties}
      data-live={live ? "true" : undefined}
    >
      <Figure className="h-[72%] w-[72%]" />
    </span>
  );
}

/** One bubble of the conversation: the pet's on the left with its face beside it, the user's on the right. */
function Bubble({ turn, dim = false }: { turn: CallTurn; dim?: boolean }) {
  const mine = turn.role === "user";
  // The side says who is talking to the eye; a screen reader gets it as a name, since a bubble on
  // its own is just a sentence.
  const who = mine ? S.pet.callYou : S.pet.callPet;
  return (
    <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
      {!mine && <PetAvatar className="h-5 w-5" />}
      <p
        aria-label={`${who}: ${turn.text}`}
        className={`pet-bubble max-w-[78%] rounded-2xl px-2 py-1 text-xs leading-snug break-words ${
          mine
            ? "rounded-br-sm bg-accent text-accent-fg"
            : "rounded-bl-sm bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100"
        } ${dim ? "opacity-70" : ""}`}
      >
        {turn.text}
        {turn.interrupted === true && (
          <span className="ml-1 opacity-70">{S.pet.callInterrupted}</span>
        )}
      </p>
    </div>
  );
}

/** The pet's bubble while it has nothing to say yet: three dots that keep the column alive. */
function ThinkingBubble(): ReactElement {
  return (
    <div className="flex items-end gap-1.5">
      <PetAvatar className="h-5 w-5" />
      <span className="pet-bubble rounded-2xl rounded-bl-sm bg-gray-100 px-2.5 py-2 dark:bg-gray-800">
        <span className="pet-thinking flex gap-1">
          <i />
          <i />
          <i />
        </span>
      </span>
    </div>
  );
}
