/**
 * One call, as a hook: the state machine over the frames a call is made of, plus the two audio
 * pipelines it drives.
 *
 * The sequence it implements is the provider's own — a session, then turn-taking — and the details
 * that matter are all about interruption. When the user starts talking, the reply still playing is
 * flushed immediately and the reply's own record of itself is dropped: the provider reports a
 * cancelled response afterwards, and that response is kept as a turn marked interrupted rather than
 * as a reply that finished. Without the immediate flush the pet keeps talking over the person who
 * is trying to interrupt it, which is the one thing that makes a spoken interface feel dead.
 *
 * Levels are quantized to a tenth before they reach state. The microphone's level arrives once per
 * audio frame — tens of times a second — and a raw number there re-renders the pet page on every
 * one of them for a meter that cannot show the difference.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MicCapture, Player } from "./audio";
import { RealtimeClient } from "./realtime-client";
import { LIVE_CALL_STATES } from "./types";
import type { CallStatus, CallTurn, RealtimeEvent } from "./types";

/** A level as the meter reads it: one decimal, so a still meter does not re-render anything. */
const quantize = (value: number): number => Math.round(value * 10) / 10;

export interface PetCall {
  status: CallStatus;
  /** A call is running, so the stage is live. */
  active: boolean;
  /** The stage is on screen at all: a running call, or one that just ended with something to say. */
  open: boolean;
  turns: readonly CallTurn[];
  /** What the user is saying right now, as the provider recognizes it. */
  partial: string;
  /** What the reply is saying right now, as the provider speaks it. */
  liveText: string;
  micLevel: number;
  outLevel: number;
  muted: boolean;
  /** What went wrong, in the provider's or this client's words. Empty while a call is fine. */
  error: string;
  start: () => void;
  hangUp: () => void;
  /** Puts the stage away after it has said what went wrong; a no-op while a call is running. */
  dismiss: () => void;
  toggleMute: () => void;
}

/** What the call needs to know about the server before the button is worth pressing. */
export interface PetCallOptions {
  /** A key is stored, so a call can lead somewhere. */
  configured: boolean;
  /** Why a call cannot start, shown instead of one. Empty when it can. */
  unavailable: string;
}

export function usePetCall(options: PetCallOptions): PetCall {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [turns, setTurns] = useState<readonly CallTurn[]>([]);
  const [partial, setPartial] = useState("");
  const [liveText, setLiveText] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [outLevel, setOutLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");

  const clientRef = useRef<RealtimeClient | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<Player | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const assistantRef = useRef("");
  /** A hang-up we asked for: its socket close is the expected one, not a failure to report. */
  const closingRef = useRef(false);

  /** Drops every audio resource; safe to call twice. */
  const teardown = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    playerRef.current?.flush();
    playerRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setMicLevel(0);
    setOutLevel(0);
  }, []);

  const addTurn = useCallback((turn: CallTurn) => {
    setTurns((prev) => [...prev, turn]);
  }, []);

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      switch (event.type) {
        case "session.updated":
          setStatus((prev) => (prev === "connecting" ? "listening" : prev));
          break;

        case "input_audio_buffer.speech_started":
          // The interruption: whatever is still queued is not going to be heard, and the reply's
          // own text is discarded so the turn is recorded as what actually happened.
          playerRef.current?.flush();
          assistantRef.current = "";
          setLiveText("");
          setPartial("");
          setStatus("listening");
          break;

        case "conversation.item.input_audio_transcription.delta": {
          // `stash` is the whole sentence so far, `text` a step of it; a provider that sends one
          // or the other is handled by taking whichever it sent.
          const stash = typeof event.stash === "string" ? event.stash : "";
          const delta = typeof event.text === "string" ? event.text : "";
          if (stash !== "") setPartial(stash);
          else if (delta !== "") setPartial((prev) => prev + delta);
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          setPartial("");
          const transcript = typeof event.transcript === "string" ? event.transcript : "";
          if (transcript !== "") addTurn({ role: "user", text: transcript });
          setStatus("thinking");
          break;
        }

        case "response.created":
          assistantRef.current = "";
          setLiveText("");
          setStatus("thinking");
          break;

        case "response.audio_transcript.delta":
          assistantRef.current += typeof event.delta === "string" ? event.delta : "";
          setLiveText(assistantRef.current);
          break;

        case "response.audio.delta":
          if (typeof event.delta === "string") playerRef.current?.enqueue(event.delta);
          setStatus("speaking");
          break;

        case "response.done": {
          const response = (event.response ?? {}) as Record<string, unknown>;
          const output = Array.isArray(response.output) ? response.output : [];
          const content = (output[0] as Record<string, unknown> | undefined)?.content;
          const first = (Array.isArray(content) ? content[0] : undefined) as
            Record<string, unknown> | undefined;
          const spoken = typeof first?.transcript === "string" ? first.transcript : "";
          const text = spoken !== "" ? spoken : assistantRef.current;
          if (text !== "") {
            addTurn({ role: "assistant", text, interrupted: response.status !== "completed" });
          }
          assistantRef.current = "";
          setLiveText("");
          setStatus((prev) => (prev === "error" ? prev : "listening"));
          break;
        }

        case "error": {
          const err = event.error as Record<string, unknown> | undefined;
          const message = typeof err?.message === "string" ? err.message : "";
          setError(message !== "" ? message : "语音服务返回了一个错误。");
          break;
        }

        case "proxy.error":
          setError(typeof event.message === "string" ? event.message : "语音服务连接失败。");
          setStatus("error");
          break;

        default:
          break;
      }
    },
    [addTurn],
  );

  const start = useCallback(() => {
    if (clientRef.current !== null) return;
    if (!options.configured) {
      setError(options.unavailable);
      setStatus("error");
      return;
    }
    setError("");
    setPartial("");
    setLiveText("");
    setTurns([]);
    setMuted(false);
    assistantRef.current = "";
    closingRef.current = false;
    setStatus("connecting");

    const ctx = new AudioContext({ latencyHint: "interactive" });
    ctxRef.current = ctx;
    void ctx.resume().catch(() => {});
    playerRef.current = new Player(ctx);

    const client = new RealtimeClient({
      onEvent: handleEvent,
      onClose: (reason) => {
        if (closingRef.current) return;
        setStatus("ended");
        if (reason !== "") setError(reason);
        teardown();
      },
    });
    clientRef.current = client;

    void (async () => {
      try {
        await client.connect();
      } catch (err) {
        clientRef.current = null;
        setStatus("error");
        setError(err instanceof Error ? err.message : "连不上语音服务。");
        teardown();
        return;
      }
      try {
        const mic = new MicCapture();
        await mic.start({
          onAudio: (base64) => clientRef.current?.appendAudio(base64),
          onLevel: (value) => setMicLevel(quantize(value)),
        });
        micRef.current = mic;
      } catch {
        // A refused microphone is not a dead call: the pet's answer is still audible, and the
        // stage says the microphone is the half that is missing.
        setMuted(true);
        setError("没有拿到麦克风权限，只能听不能说。");
      }
    })();
  }, [handleEvent, options.configured, options.unavailable, teardown]);

  const hangUp = useCallback(() => {
    closingRef.current = true;
    clientRef.current?.close();
    clientRef.current = null;
    teardown();
    setStatus("ended");
    setLiveText("");
    setPartial("");
    setMuted(false);
    assistantRef.current = "";
  }, [teardown]);

  /**
   * Puts the stage away. Only from a call that is not running: a live call is ended by hanging up,
   * which is a different thing from clearing the message a failed one left.
   */
  const dismiss = useCallback(() => {
    if (clientRef.current !== null) return;
    setStatus("idle");
    setError("");
    setTurns([]);
    setLiveText("");
    setPartial("");
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      micRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // The speaking meter. Read off the player each animation frame — the level is a property of audio
  // that is playing, so it has no event to ride on.
  useEffect(() => {
    if (status !== "speaking") {
      setOutLevel(0);
      return;
    }
    let frame = 0;
    const tick = (): void => {
      const player = playerRef.current;
      if (player !== null) setOutLevel(quantize(player.level()));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setOutLevel(0);
    };
  }, [status]);

  // Leaving the page hangs up: the window's own close is the one hang-up nobody gets to press.
  useEffect(
    () => () => {
      clientRef.current?.close();
      teardown();
    },
    [teardown],
  );

  return {
    status,
    active: LIVE_CALL_STATES.has(status),
    open: status !== "idle",
    turns,
    partial,
    liveText,
    micLevel,
    outLevel,
    muted,
    error,
    start,
    hangUp,
    dismiss,
    toggleMute,
  };
}
