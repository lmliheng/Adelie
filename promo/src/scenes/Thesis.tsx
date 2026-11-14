import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, SANS } from "../theme";

/**
 * Scene 2 — 被钩住 (120–270). Two sentences, one strike-through, one diagonal.
 *
 * The first sentence is struck out and dropped to 38%: that single act of negation
 * is what lets the second sentence stand without a single adjective. The diagonal
 * hairline is the scene's composition — it ties the top-left told-old to the
 * bottom-right told-new, and it is the first place the "don't float in the centre"
 * rule changes what the frame looks like.
 */
export const Thesis: React.FC = () => {
  const frame = useCurrentFrame();

  const strike = interpolate(frame, [16, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const oldOpacity = interpolate(frame, [34, 52], [1, 0.38], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const diagonal = interpolate(frame, [40, 78], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const newOpacity = interpolate(frame, [58, 76], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const newRise = interpolate(frame, [58, 84], [26, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill>
      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", inset: 0 }}
        viewBox="0 0 1920 1080"
      >
        <line
          x1={150}
          y1={536}
          x2={1780}
          y2={700}
          stroke="#d8d8d8"
          strokeWidth={1}
          strokeDasharray={1800}
          strokeDashoffset={1800 * (1 - diagonal)}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          left: 26,
          top: 224,
          fontFamily: SANS,
          fontSize: 64,
          fontWeight: 500,
          color: C.ink,
          opacity: oldOpacity,
          letterSpacing: "-0.01em",
        }}
      >
        大多数 AI，只会陪你聊天。
        <div
          style={{
            position: "absolute",
            left: -8,
            top: "54%",
            height: 2,
            width: `${strike * 101}%`,
            background: C.ink,
            opacity: 0.5,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          right: 26,
          bottom: 226,
          textAlign: "right",
          fontFamily: SANS,
          fontSize: 92,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: C.ink,
          opacity: newOpacity,
          transform: `translateY(${newRise}px)`,
        }}
      >
        Adelie：<span style={{ color: C.accent }}>写一段话</span>
        ，它就开始干活。
      </div>

      <div
        style={{
          position: "absolute",
          left: 956,
          top: 610,
          width: 8,
          height: 8,
          background: C.accent,
          opacity: diagonal * 0.55,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 96,
          height: 1,
          background: C.line,
          opacity: diagonal,
        }}
      />
    </AbsoluteFill>
  );
};
