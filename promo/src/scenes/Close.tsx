import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BrandMark } from "../BrandMark";
import { fade } from "../motion";
import { C, MONO, SANS } from "../theme";

/**
 * Scene 9 — 找得到 (1650–1800). Three things and nothing else: the mark, the slogan,
 * the repository. No QR code, no download button: this film lives in a README and in
 * chat windows, where what the viewer needs is a name they can remember and search.
 */

export const Close: React.FC = () => {
  const frame = useCurrentFrame();

  const mark = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 210,
          display: "flex",
          justifyContent: "center",
          opacity: mark,
        }}
      >
        <BrandMark
          size={300}
          arc={mark}
          spin={frame * 0.12}
          scale={0.9 + mark * 0.1}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 540,
          textAlign: "center",
          fontFamily: SANS,
          fontSize: 116,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: C.ink,
          opacity: fade(frame, 8, 12),
          transform: `translateY(${interpolate(frame, [8, 30], [18, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          })}px)`,
        }}
      >
        Adelie
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 700,
          textAlign: "center",
          fontFamily: SANS,
          fontSize: 34,
          fontWeight: 500,
          color: C.muted,
          letterSpacing: "0.01em",
          opacity: fade(frame, 26, 12),
        }}
      >
        写一段话，就是一个智能体。
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 812,
          display: "flex",
          justifyContent: "center",
          opacity: fade(frame, 40, 12),
        }}
      >
        <div
          style={{
            border: `1px solid ${C.line}`,
            borderRadius: 999,
            padding: "12px 24px",
            fontFamily: MONO,
            fontSize: 18,
            color: C.ink,
            background: C.paper,
          }}
        >
          github.com/lmliheng/Adelie
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 168,
          height: 1,
          background: C.line,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            width: interpolate(frame, [56, 80], [0, 180], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            height: 1,
            marginLeft: interpolate(frame, [56, 80], [0, -90], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            background: C.accent,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
