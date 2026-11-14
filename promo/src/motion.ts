import { Easing, interpolate, spring } from "remotion";

/** The film's single easing set (DESIGN.md §5). */
export const SPRING = { damping: 200, stiffness: 110, mass: 0.6 } as const;

/** Rises into place: spring displacement + a short fade. */
export const rise = (frame: number, fps: number, delay = 0, distance = 28) => {
  const p = spring({ frame: frame - delay, fps, config: SPRING });
  return {
    transform: `translateY(${(1 - p) * distance}px)`,
    opacity: Math.min(1, p * 1.6),
  };
};

/** Card growth: the connector line is pulled first, the card fades after it. */
export const grow = (frame: number, fps: number, delay = 0) => {
  const p = spring({
    frame: frame - delay,
    fps,
    config: { damping: 24, stiffness: 160 },
  });
  return { scale: 0.92 + p * 0.08, opacity: Math.min(1, p * 1.4) };
};

/** Fade in over `frames`, starting at `delay`. */
export const fade = (frame: number, delay = 0, frames = 10) =>
  interpolate(frame, [delay, delay + frames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/** A number rolling from 0 (or `from`) to `to`, three-step ease out. */
export const roll = (
  frame: number,
  delay: number,
  frames: number,
  to: number,
  from = 0,
) =>
  interpolate(frame, [delay, delay + frames], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

/** Types out `text`: one character every `perChar` frames after `delay`. */
export const typed = (
  text: string,
  frame: number,
  delay: number,
  perChar = 1.1,
) => {
  const n = Math.max(0, Math.floor((frame - delay) / perChar));
  return text.slice(0, Math.min(text.length, n));
};

/** The slow push every scene keeps (§5): 1 → 1.012 across the scene. */
export const push = (frame: number, duration: number) =>
  1 +
  interpolate(frame, [0, duration], [0, 0.012], { extrapolateRight: "clamp" });

/** Scene wrapper: 8-frame cross fade in, 8-frame out, never a black dip. */
export const sceneOpacity = (frame: number, duration: number) =>
  Math.min(
    interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [duration - 8, duration], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
