import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fade, grow, push, typed } from "../motion";
import { C, MONO, SANS } from "../theme";

/**
 * Scene 3 — 听懂 (270–570). The scene this cut exists for: an agent is a paragraph in
 * a file. The left page is a real document (`agents/default_agent/agent_state/AGENTS.md`
 * is re-read on every session by `loadAgentState`); the four lines that carry rules
 * are typed one at a time, and each one grows a capability on the right.
 *
 * The page is a whole document rather than four floating lines: a full-height editor
 * with three-quarters of it blank would be exactly the emptiness this cut is fixing.
 */

const PATH = "agents/default_agent/agent_state/AGENTS.md";

type Line = {
  text: string;
  kind: "title" | "head" | "body";
  at?: number;
};

const DOC: Line[] = [
  { text: "# AGENTS.md", kind: "title" },
  { text: "", kind: "body" },
  { text: "你是 Adelie 的研究助理。", kind: "body", at: 20 },
  { text: "", kind: "body" },
  { text: "## 每天", kind: "head" },
  { text: "每天 09:00 汇总 arXiv 上 cs.CL 的新论文，", kind: "body", at: 46 },
  { text: "按主题分组，每条不超过两行。", kind: "body", at: 46 },
  { text: "", kind: "body" },
  { text: "## 写下去", kind: "head" },
  { text: "写进 ~/notes/arxiv/YYYY-MM-DD.md，", kind: "body", at: 62 },
  { text: "并在聊天里只报标题与条数。", kind: "body", at: 62 },
  { text: "", kind: "body" },
  { text: "## 兜底", kind: "head" },
  { text: "不确定的论文放在最后，标「待确认」。", kind: "body", at: 78 },
];

const CARDS = [
  { title: "定时任务", detail: "09:00 · 每天", at: 30 },
  { title: "文件工具", detail: "写 ~/notes/arxiv/", at: 46 },
  { title: "输出约束", detail: "每条不超过两行", at: 62 },
  { title: "兜底规则", detail: "「待确认」单独一段", at: 78 },
];

export const TextAgent: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const merge = interpolate(frame, [96, 112], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const caption =
    frame >= 240 ? "改这段文字，就是进化。" : "写一段话，就是一个智能体。";
  const captionAt = frame >= 240 ? 240 : 112;
  const cursorOn = Math.floor(frame / 8) % 2 === 0;

  return (
    <AbsoluteFill style={{ transform: `scale(${push(frame, 300)})` }}>
      {/* ── the page: bleeds off the left edge, stops at the seam ── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1248,
          height: 1080,
          background: C.paper,
          borderRight: `1px solid ${C.line}`,
          opacity: fade(frame, 0, 10),
          transform: `translateX(${interpolate(frame, [0, 20], [-60, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          })}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 96,
            top: 44,
            fontFamily: MONO,
            fontSize: 14,
            color: C.muted,
          }}
        >
          {PATH}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 80,
            height: 1,
            background: C.line,
          }}
        />

        <div style={{ position: "absolute", left: 96, top: 120, right: 60 }}>
          {DOC.map((line, i) => {
            const shown =
              line.at === undefined
                ? line.text
                : typed(line.text, frame, line.at, 1.1);
            const typing =
              line.at !== undefined && shown.length < line.text.length;
            const isLast =
              typing || (line.at !== undefined && frame >= line.at);
            return (
              <div key={i} style={{ display: "flex", gap: 24, height: 46 }}>
                <div
                  style={{
                    width: 28,
                    textAlign: "right",
                    fontFamily: MONO,
                    fontSize: 14,
                    lineHeight: "46px",
                    color: C.subtle,
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: line.kind === "title" ? 24 : 22,
                    lineHeight: "46px",
                    whiteSpace: "pre",
                    color:
                      line.kind === "head"
                        ? C.muted
                        : line.kind === "title"
                          ? C.ink
                          : C.ink,
                    opacity: line.kind === "head" ? 0.9 : 1,
                  }}
                >
                  {shown}
                  {typing && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 11,
                        height: 24,
                        marginLeft: 2,
                        verticalAlign: "-4px",
                        background: C.accent,
                        opacity: cursorOn ? 1 : 0,
                      }}
                    />
                  )}
                  {!typing &&
                    isLast &&
                    line.at !== undefined &&
                    frame < line.at + 8 && (
                      <span style={{ opacity: 0 }}> </span>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── what that text configures ── */}
      <div
        style={{
          position: "absolute",
          left: 1248,
          top: 0,
          width: 672,
          height: 1080,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 48,
            top: 300,
            fontFamily: SANS,
            fontSize: 14,
            color: C.muted,
            opacity: fade(frame, 24, 10) * (1 - merge),
          }}
        >
          这段文字配出来的
        </div>

        {CARDS.map((card, i) => {
          const cardIn = grow(frame, fps, card.at + 6);
          const lineIn = interpolate(frame, [card.at, card.at + 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          return (
            <div key={card.title} style={{ opacity: 1 - merge }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 372 + i * 92 + 34,
                  width: 40 * lineIn,
                  height: 1,
                  background: C.line,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 48,
                  top: 336 + i * 92,
                  width: 528,
                  height: 76,
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "0 22px",
                  background: C.paper,
                  border: `1px solid ${C.line}`,
                  borderRadius: 14,
                  transform: `scale(${cardIn.scale})`,
                  opacity: cardIn.opacity * fade(frame, card.at, 6),
                  transformOrigin: "left center",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 8,
                    background: C.accent,
                  }}
                />
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 22,
                    fontWeight: 600,
                    color: C.ink,
                  }}
                >
                  {card.title}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 15,
                    color: C.muted,
                    marginLeft: "auto",
                  }}
                >
                  {card.detail}
                </div>
              </div>
            </div>
          );
        })}

        {merge > 0 && (
          <div
            style={{
              position: "absolute",
              left: 48,
              top: 236,
              width: 528,
              height: 560,
              background: C.paper,
              border: `1px solid ${C.line}`,
              borderRadius: 18,
              padding: 28,
              opacity: merge,
              transform: `scale(${0.96 + merge * 0.04})`,
              transformOrigin: "left top",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 13, color: C.muted }}>
              智能体
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 42,
                fontWeight: 600,
                color: C.ink,
                marginTop: 4,
                letterSpacing: "-0.01em",
              }}
            >
              研究助理
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 20,
              }}
            >
              {["定时任务", "文件工具", "输出格式", "兜底规则"].map((tag) => (
                <div
                  key={tag}
                  style={{
                    fontFamily: SANS,
                    fontSize: 15,
                    color: C.ink,
                    border: `1px solid ${C.line}`,
                    background: C.panel,
                    borderRadius: 999,
                    padding: "6px 14px",
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 28,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {[
                ["配置", "AGENTS.md · 14 行"],
                ["工具", "读文件 / 写文件 / 执行命令"],
                ["下一次运行", "明天 09:00"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{ display: "flex", gap: 12, alignItems: "baseline" }}
                >
                  <div
                    style={{
                      fontFamily: SANS,
                      fontSize: 14,
                      color: C.muted,
                      width: 92,
                    }}
                  >
                    {k}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 14, color: C.ink }}>
                    {v}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: "auto",
                fontFamily: SANS,
                fontSize: 13,
                color: C.subtle,
                borderTop: `1px solid ${C.lineSoft}`,
                paddingTop: 14,
              }}
            >
              改这段文字，它就换一个活法
            </div>
          </div>
        )}
      </div>

      {/* ── the bleed bar along the bottom ── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 96,
          background: C.panel,
          borderTop: `1px solid ${C.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: interpolate(frame, [112, 128], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          key={caption}
          style={{
            fontFamily: SANS,
            fontSize: 26,
            fontWeight: 600,
            color: C.ink,
            opacity: fade(frame, captionAt, 10),
          }}
        >
          {caption}
        </div>
      </div>
    </AbsoluteFill>
  );
};
