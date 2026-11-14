import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, MONO, SAFE, SANS } from "../theme";

/** The doc's body lines, a step off its heading. */
const MONO_LINE = "#c9ccd1";

/**
 * Scene 2 — 被钩住 (120–270).
 *
 * v1 set these two sentences centred and small-ish; v3 sets them as a left-aligned block
 * at 104px that runs most of the frame's width. Same words, but the block reaches the
 * right margin, so the frame is full instead of holding two floating lines — and the eye
 * has a single edge (the rule on the left) to start from.
 *
 * The first sentence is struck and dropped to 34%: that act of negation is what lets the
 * second one stand without an adjective.
 */
export const Thesis: React.FC = () => {
  const frame = useCurrentFrame();

  const strike = interpolate(frame, [14, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const oldOpacity = interpolate(frame, [32, 50], [1, 0.34], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const rule = interpolate(frame, [0, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const rise = (delay: number) => {
    const p = interpolate(frame, [delay, delay + 24], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    return {
      opacity: p,
      transform: `translateY(${(1 - p) * 30}px)`,
    };
  };

  return (
    <AbsoluteFill>
      {/* the edge the block hangs off */}
      <div
        style={{
          position: "absolute",
          left: SAFE,
          top: 250,
          width: 3,
          height: 560 * rule,
          background: `linear-gradient(180deg, ${C.accent}, ${C.ring})`,
          borderRadius: 3,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: SAFE + 56,
          top: 250,
          width: 1720,
          fontFamily: SANS,
        }}
      >
        <div
          style={{
            position: "relative",
            display: "inline-block",
            fontSize: 76,
            fontWeight: 500,
            color: C.muted,
            letterSpacing: "-0.01em",
            opacity: oldOpacity,
          }}
        >
          大多数 AI，只会陪你聊天。
          <div
            style={{
              position: "absolute",
              left: -10,
              top: "52%",
              height: 3,
              width: `${strike * 104}%`,
              background: C.muted,
              borderRadius: 3,
            }}
          />
        </div>

        <div style={{ height: 62 }} />

        <div
          style={{
            fontSize: 108,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: "136px",
            color: C.ink,
            ...rise(46),
          }}
        >
          Adelie <span style={{ color: C.accent }}>写一段话</span>，
        </div>
        <div
          style={{
            fontSize: 108,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: "136px",
            color: C.ink,
            ...rise(56),
          }}
        >
          它就在你的电脑上动手。
        </div>
      </div>

      {/* The right side of the frame holds the thing being talked about: four lines of
          an AGENTS.md. It is the bridge into scene 3, and it is why the frame is full. */}
      <div
        style={{
          position: "absolute",
          left: 1244,
          top: 232,
          width: 612,
          padding: "26px 28px 30px",
          background: C.panelLift,
          border: `1px solid ${C.line}`,
          borderRadius: 16,
          boxShadow: "0 40px 120px rgba(0,0,0,0.9)",
          opacity: interpolate(frame, [66, 90], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          transform: `translateY(${interpolate(frame, [66, 96], [26, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          })}px)`,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 15,
            color: C.subtle,
            marginBottom: 20,
          }}
        >
          agents/default_agent/agent_state/AGENTS.md
        </div>
        {[
          ["# 研究助理", C.ink],
          ["每天 09:00 汇总 arXiv 新论文，", MONO_LINE],
          ["按主题分组，每条不超过两行。", MONO_LINE],
          ["写进 ~/notes/arxiv/。", MONO_LINE],
        ].map(([line, color], i) => (
          <div
            key={i}
            style={{
              fontFamily: MONO,
              fontSize: 21,
              lineHeight: "38px",
              color,
              whiteSpace: "pre",
              opacity: interpolate(frame, [72 + i * 7, 82 + i * 7], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {line}
            {i === 3 && (
              <span
                style={{
                  display: "inline-block",
                  width: 9,
                  height: 20,
                  marginLeft: 2,
                  verticalAlign: "-3px",
                  background: C.accent,
                  opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0,
                }}
              />
            )}
          </div>
        ))}
        <div
          style={{
            marginTop: 22,
            paddingTop: 16,
            borderTop: `1px solid ${C.lineSoft}`,
            fontFamily: SANS,
            fontSize: 17,
            color: C.muted,
          }}
        >
          这段文字，就是一个智能体
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: SAFE,
          right: SAFE,
          bottom: SAFE,
          height: 1,
          background: C.line,
          opacity: rule,
        }}
      />
    </AbsoluteFill>
  );
};
