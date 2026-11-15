import { Easing, interpolate, spring } from "remotion";

/** The film's single easing set (DESIGN.md §5). */
export const SPRING = { damping: 200, stiffness: 110, mass: 0.6 } as const;

/**
 * Rises into place: spring displacement + a short fade.
 *
 * `PREROLL` frames of the spring are spent before the scene's first frame, because a cut
 * arrives on a composed frame, not on an empty one — without it the first ~8 frames after
 * every cut showed a half-built layout on a half-lit background.
 */
const PREROLL = 6;

export const rise = (frame: number, fps: number, delay = 0, distance = 28) => {
  const p = spring({ frame: frame - delay + PREROLL, fps, config: SPRING });
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
export const roll = (frame: number, delay: number, frames: number, to: number, from = 0) =>
  interpolate(frame, [delay, delay + frames], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

/** Types out `text`: one character every `perChar` frames after `delay`. */
export const typed = (text: string, frame: number, delay: number, perChar = 1.1) => {
  const n = Math.max(0, Math.floor((frame - delay) / perChar));
  return text.slice(0, Math.min(text.length, n));
};

/** The slow push every scene keeps (§5): 1 → 1.012 across the scene. */
export const push = (frame: number, duration: number) =>
  1 + interpolate(frame, [0, duration], [0, 0.012], { extrapolateRight: "clamp" });

/**
 * A scene snaps in over five frames from 55% rather than dissolving from black.
 *
 * v2 faded every scene in and out through black, which on a black canvas is a visible
 * dip at all sixteen cuts; a cross-dissolve was tried and was worse, because the two
 * layouts sat on top of each other for ten frames and read as a double exposure. What is
 * left is neither: the cut is a cut, and the short lift only keeps it from strobing.
 */
export const sceneOpacity = (frame: number, duration: number, body = duration) => {
  const inRamp = interpolate(frame, [0, 5], [0.55, 1], {
    extrapolateRight: "clamp",
  });
  const outRamp = interpolate(frame, [body - 2, body + 2], [1, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return Math.min(inRamp, outRamp);
};
