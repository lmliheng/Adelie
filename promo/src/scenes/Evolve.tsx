import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fade, rise, roll } from "../motion";
import { C, MONO, SANS } from "../theme";

/**
 * Scene 6 — 相信它会变强 (1080–1350). v1 drew three score cards and let the numbers
 * grow on their own; nobody could see *why* the number moved. Here the only thing that
 * moves is text: the evaluation points at two failing lines, the lines get rewritten,
 * and the score rolls **after** the diff settles. That order is the whole argument.
 */

const LINES = [
  { text: "你是 Adelie 的研究助理。", flag: false },
  { text: "每天 09:00 汇总 arXiv 上 cs.CL 的新论文，", flag: false },
  { text: "按主题分组，每条不超过两行。", flag: true },
  { text: "写进 ~/notes/arxiv/YYYY-MM-DD.md。", flag: false },
  { text: "不确定的论文放在最后，标「待确认」。", flag: true },
];

const FIXES = [
  { after: 2, text: "摘要超过两行就截到第二行末。" },
  { after: 4, text: "「待确认」单独一段，不并进任何主题。" },
];

const PILLS = ["每轮前存快照", "每个请求可回放", "改坏能回滚"];

export const Evolve: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const highlight = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const failureIn = fade(frame, 60, 12);
  const v2 = roll(frame, 200, 26, 78, 62);
  const v3 = roll(frame, 240, 22, 91, 78);

  return (
    <AbsoluteFill>
      {/* ── the text being evolved ── */}
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 190,
          width: 700,
          height: 548,
          border: `1px solid ${C.line}`,
          borderRadius: 16,
          background: C.paper,
          padding: "22px 26px",
          ...rise(frame, fps, 0, 20),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            paddingBottom: 14,
            borderBottom: `1px solid ${C.lineSoft}`,
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 13, color: C.muted }}>
            AGENTS.md
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.subtle }}>
            · v1
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          {LINES.map((line, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 16,
                  lineHeight: "26px",
                  color: C.ink,
                  position: "relative",
                  display: "inline-block",
                }}
              >
                {line.text}
                {line.flag && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: -4,
                      height: 6,
                      opacity: highlight,
                      backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='6'><path d='M0 4 Q2 0 4 4 T8 4' fill='none' stroke='%23a1a1a1' stroke-width='1.2'/></svg>")`,
                      backgroundRepeat: "repeat-x",
                    }}
                  />
                )}
              </div>
              {FIXES.filter((f) => f.after === i).map((fix) => (
                <div
                  key={fix.text}
                  style={{
                    marginTop: 8,
                    marginLeft: 0,
                    paddingLeft: 12,
                    borderLeft: `2px solid ${C.accent}`,
                    background: C.accentWash,
                    fontFamily: MONO,
                    fontSize: 15,
                    lineHeight: "24px",
                    color: C.ink,
                    opacity: fade(frame, 120, 16),
                    transform: `translateX(${interpolate(
                      frame,
                      [120, 140],
                      [-10, 0],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: Easing.out(Easing.cubic),
                      },
                    )}px)`,
                  }}
                >
                  + {fix.text}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            left: 26,
            right: 26,
            bottom: 18,
            borderTop: `1px solid ${C.lineSoft}`,
            paddingTop: 14,
            display: "flex",
            fontFamily: MONO,
            fontSize: 12,
            color: C.subtle,
          }}
        >
          <div>snapshots/ · 每轮之前自动快照</div>
          <div style={{ marginLeft: "auto" }}>v1 → v2 → v3</div>
        </div>
      </div>

      {/* ── what the evaluation pointed at ── */}
      <div
        style={{
          position: "absolute",
          left: 836,
          top: 190,
          width: 400,
          height: 400,
          border: `1px solid ${C.line}`,
          borderRadius: 16,
          background: C.panel,
          padding: "24px 24px",
          opacity: failureIn,
        }}
      >
        <div style={{ fontFamily: SANS, fontSize: 14, color: C.muted }}>
          评估
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            marginTop: 6,
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 86,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: "-0.02em",
            }}
          >
            {Math.round(roll(frame, 0, 24, 62))}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.subtle }}>
            示意数据
          </div>
        </div>

        <div
          style={{
            marginTop: 26,
            borderTop: `1px solid ${C.line}`,
            paddingTop: 16,
          }}
        >
          {["摘要常常超过两行", "「待确认」还是并进了主题"].map((item, i) => (
            <div
              key={item}
              style={{
                fontFamily: SANS,
                fontSize: 15,
                lineHeight: "24px",
                color: C.ink,
                marginBottom: 10,
                opacity: fade(frame, 70 + i * 8, 10),
              }}
            >
              · {item}
            </div>
          ))}
        </div>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 12,
            color: C.subtle,
            marginTop: 8,
          }}
        >
          失分点都指得回上面那两句
        </div>
      </div>

      {/* ── the round after the rewrite ── */}
      <div
        style={{
          position: "absolute",
          left: 1276,
          top: 190,
          width: 548,
          height: 400,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          opacity: fade(frame, 196, 12),
        }}
      >
        <div
          style={{
            border: `1px solid ${C.line}`,
            borderRadius: 16,
            background: C.paper,
            padding: "20px 22px",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 13, color: C.muted }}>
            v2
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 38,
              fontWeight: 600,
              color: C.ink,
            }}
          >
            {Math.round(v2)}
          </div>
          <div
            style={{
              fontFamily: SANS,
              fontSize: 13,
              color: C.muted,
              marginLeft: "auto",
            }}
          >
            改完这段文字
          </div>
        </div>

        {frame >= 232 && (
          <div
            style={{
              border: `1px solid ${C.accentLine}`,
              borderRadius: 16,
              background: C.accentWash,
              padding: "20px 22px",
              display: "flex",
              alignItems: "center",
              gap: 16,
              opacity: fade(frame, 238, 10),
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 13, color: C.accent }}>
              v3
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 38,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              {Math.round(v3)}
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 13,
                color: C.accent,
                marginLeft: "auto",
              }}
            >
              当前版本
            </div>
          </div>
        )}

        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}
        >
          {PILLS.map((pill) => (
            <div
              key={pill}
              style={{
                fontFamily: SANS,
                fontSize: 13,
                color: C.ink,
                border: `1px solid ${C.line}`,
                borderRadius: 999,
                padding: "6px 12px",
                background: C.paper,
              }}
            >
              {pill}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 96,
          bottom: 76,
          fontFamily: SANS,
          fontSize: 20,
          color: C.muted,
          opacity: fade(frame, 150, 12),
        }}
      >
        找失分点 → 改这段文字 → 分数才动
      </div>
    </AbsoluteFill>
  );
};
