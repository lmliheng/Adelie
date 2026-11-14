import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fade, rise, roll } from "../motion";
import { C, MONO, SAFE, SANS } from "../theme";

/**
 * Scene 6 — 相信它会变强 (1080–1350).
 *
 * The one thing that may move in this scene is text: the evaluation points at two failing
 * lines, those two lines get rewritten, and the score rolls **after** the diff settles.
 * That order is the argument. v1 showed three score cards with numbers growing on their
 * own, which proves nothing; v3 keeps v1's big-number payoff but hangs it on a diff the
 * viewer has just watched being edited.
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
  const failureIn = fade(frame, 40, 12);
  const v2 = roll(frame, 200, 26, 78, 62);
  const v3 = roll(frame, 240, 22, 91, 78);

  return (
    <AbsoluteFill>
      {/* ── heading ── */}
      <div
        style={{
          position: "absolute",
          left: SAFE,
          top: 84,
          ...rise(frame, fps, 0, 22),
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontSize: 19,
            letterSpacing: "0.2em",
            color: C.accent,
          }}
        >
          自进化
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: SANS,
            fontSize: 62,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: C.ink,
          }}
        >
          它给自己打分，然后改自己的文字。
        </div>
      </div>

      {/* ── the text being evolved ── */}
      <div
        style={{
          position: "absolute",
          left: SAFE,
          top: 286,
          width: 1010,
          height: 628,
          border: `1px solid ${C.line}`,
          borderRadius: 18,
          background: C.panel,
          padding: "24px 30px",
          boxShadow: "0 40px 120px rgba(0,0,0,0.8)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            paddingBottom: 16,
            borderBottom: `1px solid ${C.lineSoft}`,
            fontFamily: MONO,
            fontSize: 16,
            color: C.muted,
          }}
        >
          <div>AGENTS.md</div>
          <div style={{ color: C.subtle }}>· v1</div>
          <div style={{ marginLeft: "auto", color: C.subtle }}>
            snapshots/ 每轮之前自动快照
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          {LINES.map((line, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 23,
                  lineHeight: "38px",
                  color: line.flag ? C.ink : C.muted,
                  display: "inline-block",
                  textDecoration: line.flag ? "underline wavy" : "none",
                  textDecorationColor: `rgba(248, 113, 113, ${highlight})`,
                  textUnderlineOffset: 8,
                  textDecorationThickness: 2,
                }}
              >
                {line.text}
              </div>
              {FIXES.filter((f) => f.after === i).map((fix) => (
                <div
                  key={fix.text}
                  style={{
                    marginTop: 10,
                    display: "inline-block",
                    paddingLeft: 16,
                    paddingRight: 20,
                    borderLeft: `2px solid ${C.accent}`,
                    background: C.accentWash,
                    fontFamily: MONO,
                    fontSize: 22,
                    lineHeight: "36px",
                    color: C.ink,
                    opacity: fade(frame, 120, 16),
                    transform: `translateX(${interpolate(
                      frame,
                      [120, 140],
                      [-14, 0],
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
          {["## 工具", "读：工作区里的一切文件", "写：只在 ~/notes 下"].map(
            (line) => (
              <div
                key={line}
                style={{
                  fontFamily: MONO,
                  fontSize: 22,
                  lineHeight: "40px",
                  color: C.subtle,
                }}
              >
                {line}
              </div>
            ),
          )}
        </div>

        <div
          style={{
            position: "absolute",
            left: 30,
            right: 30,
            bottom: 20,
            borderTop: `1px solid ${C.lineSoft}`,
            paddingTop: 14,
            fontFamily: MONO,
            fontSize: 16,
            color: C.subtle,
          }}
        >
          +2 行 · 分数在下一轮才动
        </div>
      </div>

      {/* ── scores ── */}
      <div
        style={{
          position: "absolute",
          left: 1128,
          top: 286,
          width: 728,
          height: 628,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div
          style={{
            border: `1px solid ${C.line}`,
            borderRadius: 18,
            background: C.panel,
            padding: "26px 30px",
            opacity: failureIn,
            transform: `translateY(${(1 - failureIn) * 24}px)`,
          }}
        >
          <div style={{ fontFamily: SANS, fontSize: 18, color: C.muted }}>
            v1 · 基线，自己出题自测
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              marginTop: 2,
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 132,
                fontWeight: 700,
                lineHeight: "150px",
                color: C.ink,
                letterSpacing: "-0.04em",
              }}
            >
              {Math.round(roll(frame, 0, 24, 62))}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 22, color: C.subtle }}>
              / 100
            </div>
          </div>
          <div
            style={{
              marginTop: 12,
              borderTop: `1px solid ${C.line}`,
              paddingTop: 16,
            }}
          >
            {["摘要常常超过两行", "「待确认」还是并进了主题"].map((item, i) => (
              <div
                key={item}
                style={{
                  fontFamily: SANS,
                  fontSize: 21,
                  lineHeight: "34px",
                  color: C.muted,
                  opacity: fade(frame, 50 + i * 8, 10),
                }}
              >
                <span style={{ color: "#f87171" }}>×</span> {item}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{ display: "flex", gap: 18, opacity: fade(frame, 196, 12) }}
        >
          {[
            {
              label: "v2",
              value: Math.round(v2),
              note: "改完这段文字",
              accent: false,
            },
            {
              label: "v3",
              value: Math.round(v3),
              note: "当前版本",
              accent: true,
            },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                flex: 1,
                border: `1px solid ${card.accent ? C.accentLine : C.line}`,
                borderRadius: 18,
                background: card.accent ? C.accentWash : C.panel,
                padding: "24px 26px",
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 17,
                  color: card.accent ? C.accent : C.muted,
                }}
              >
                {card.label}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 84,
                  fontWeight: 700,
                  lineHeight: "100px",
                  color: C.ink,
                  letterSpacing: "-0.03em",
                }}
              >
                {card.value}
              </div>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 17,
                  color: card.accent ? C.accent : C.subtle,
                }}
              >
                {card.note}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {PILLS.map((pill) => (
            <div
              key={pill}
              style={{
                fontFamily: SANS,
                fontSize: 17,
                color: C.muted,
                border: `1px solid ${C.line}`,
                borderRadius: 999,
                padding: "7px 16px",
                background: C.panel,
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
          left: SAFE,
          bottom: 92,
          fontFamily: SANS,
          fontSize: 34,
          fontWeight: 600,
          color: C.muted,
          opacity: fade(frame, 150, 14),
        }}
      >
        找失分点 <span style={{ color: C.subtle }}>→</span> 改这段文字{" "}
        <span style={{ color: C.subtle }}>→</span>{" "}
        <span style={{ color: C.ink }}>分数才动</span>
      </div>
    </AbsoluteFill>
  );
};
