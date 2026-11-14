import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BrandMark } from "../BrandMark";
import { C, SAFE, SANS } from "../theme";

/**
 * Scene 1 — 认得它 (0–120). The icon lands, the orbit draws itself, the wordmark closes
 * its tracking. Nothing else: the first thing a viewer must recognise is the app they
 * may already have in the dock. The glow behind the plate is the scene's only light.
 */
export const Open: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arc = interpolate(frame, [0, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const spin = frame * 0.18;

  const drop = spring({
    frame: frame - 26,
    fps,
    config: { damping: 15, stiffness: 120 },
  });
  const rotate = interpolate(frame, [26, 44], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const tracking = interpolate(frame, [36, 64], [0.34, 0.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const wordOpacity = interpolate(frame, [36, 64], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 168,
          display: "flex",
          justifyContent: "center",
          transform: `translateY(${(1 - drop) * -26}px) rotate(${rotate}deg)`,
          opacity: drop,
        }}
      >
        <BrandMark size={500} arc={arc} spin={spin} />
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 742,
          textAlign: "center",
          fontFamily: SANS,
          fontSize: 112,
          fontWeight: 600,
          letterSpacing: `${tracking}em`,
          color: C.ink,
          opacity: wordOpacity,
        }}
      >
        Adelie
      </div>

      {/* The safe-area rule as a hairline that bleeds off both edges. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: SAFE / 2,
          height: 1,
          background: C.line,
          transform: `scaleX(${interpolate(frame, [70, 100], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          })})`,
        }}
      />
    </AbsoluteFill>
  );
};
