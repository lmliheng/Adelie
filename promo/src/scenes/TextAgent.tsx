import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { fade, push } from "../motion";
import { C, MONO, SAFE, SANS } from "../theme";

/**
 * Scene 3 — 听懂 (270–570). The scene the film exists for: an agent is a paragraph in a
 * file.
 *
 * v2 printed this as a full-bleed white page with a hairline seam and 22px mono, which on
 * screen read as a document — correct, and much too quiet for the one idea that has to
 * land. v3 does what v1 did with its window: the editor becomes an object sitting in the
 * dark, 26px mono on a `#0d0d0d` panel, and each rule that finishes typing pushes a
 * capability into the card on the right. Reading is still the point; it is just lit.
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
  { text: "你是 Adelie 的研究助理。", kind: "body", at: 18 },
  { text: "", kind: "body" },
  { text: "## 每天", kind: "head" },
  { text: "每天 09:00 汇总 arXiv 上 cs.CL 的新论文，", kind: "body", at: 42 },
  { text: "按主题分组，每条不超过两行。", kind: "body", at: 42 },
  { text: "", kind: "body" },
  { text: "## 写下去", kind: "head" },
  { text: "写进 ~/notes/arxiv/YYYY-MM-DD.md，", kind: "body", at: 58 },
  { text: "并在聊天里只报标题与条数。", kind: "body", at: 58 },
  { text: "", kind: "body" },
  { text: "## 兜底", kind: "head" },
  { text: "不确定的论文放在最后，标「待确认」。", kind: "body", at: 74 },
];

const CARDS = [
  { title: "定时任务", detail: "每天 09:00", at: 30 },
  { title: "文件工具", detail: "写 ~/notes/arxiv/", at: 46 },
  { title: "输出约束", detail: "每条不超过两行", at: 62 },
  { title: "兜底规则", detail: "「待确认」单独一段", at: 78 },
];

export const TextAgent: React.FC = () => {
  const frame = useCurrentFrame();

  const merge = interpolate(frame, [96, 114], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const secondCaption = frame >= 168;

  const cursorOn = Math.floor(frame / 8) % 2 === 0;

  return (
    <AbsoluteFill style={{ transform: `scale(${push(frame, 300)})` }}>
      {/* ── the editor: an object in the dark, not a page ── */}
      <div
        style={{
          position: "absolute",
          left: SAFE,
          top: 84,
          width: 1080,
          height: 856,
          background: C.panel,
          border: `1px solid ${C.line}`,
          borderRadius: 18,
          boxShadow: "0 50px 140px rgba(0, 0, 0, 0.85)",
          overflow: "hidden",
          opacity: fade(frame, 0, 10),
          transform: `translateY(${interpolate(frame, [0, 22], [34, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          })}px)`,
        }}
      >
        <div
          style={{
            height: 62,
            borderBottom: `1px solid ${C.lineSoft}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 24px",
            background: C.panelLift,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 10,
              background: C.accent,
            }}
          />
          <div style={{ fontFamily: MONO, fontSize: 17, color: C.muted }}>{PATH}</div>
          <div
            style={{
              marginLeft: "auto",
              fontFamily: MONO,
              fontSize: 15,
              color: C.subtle,
            }}
          >
            纯文本 · 每次会话重新读取
          </div>
        </div>

        <div style={{ position: "absolute", left: 40, top: 108, right: 40 }}>
          {DOC.map((line, i) => {
            const shown =
              line.at === undefined ? line.text : typedLine(line.text, frame, line.at, 1.05);
            const typing = line.at !== undefined && shown.length < line.text.length;
            return (
              <div key={i} style={{ display: "flex", gap: 22, height: 50 }}>
                <div
                  style={{
                    width: 30,
                    textAlign: "right",
                    fontFamily: MONO,
                    fontSize: 15,
                    lineHeight: "50px",
                    color: C.subtle,
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: line.kind === "title" ? 29 : 26,
                    lineHeight: "50px",
                    whiteSpace: "pre",
                    color: line.kind === "head" ? C.accent : C.ink,
                    fontWeight: line.kind === "title" ? 600 : 400,
                  }}
                >
                  {shown}
                  {typing && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 13,
                        height: 28,
                        marginLeft: 3,
                        verticalAlign: "-6px",
                        background: C.accent,
                        opacity: cursorOn ? 1 : 0,
                      }}
                    />
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
          left: 1208,
          top: 84,
          width: 648,
          height: 856,
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontSize: 19,
            letterSpacing: "0.14em",
            color: C.subtle,
            opacity: fade(frame, 20, 10) * (1 - merge),
          }}
        >
          这段文字配出来的
        </div>

        {CARDS.map((card, i) => {
          const cardIn = interpolate(frame, [card.at + 4, card.at + 16], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          return (
            <div
              key={card.title}
              style={{
                position: "absolute",
                left: 0,
                top: 60 + i * 116,
                width: 648,
                height: 96,
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "0 26px",
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 16,
                opacity: cardIn * (1 - merge),
                transform: `translateX(${(1 - cardIn) * 40}px)`,
              }}
            >
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 9,
                  background: C.accent,
                }}
              />
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 27,
                  fontWeight: 600,
                  color: C.ink,
                }}
              >
                {card.title}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 18,
                  color: C.muted,
                  marginLeft: "auto",
                }}
              >
                {card.detail}
              </div>
            </div>
          );
        })}

        {merge > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 648,
              height: 856,
              background: C.panel,
              border: `1px solid ${C.accentLine}`,
              borderRadius: 20,
              padding: "34px 34px 30px",
              opacity: merge,
              transform: `scale(${0.94 + merge * 0.06})`,
              transformOrigin: "right center",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 50px 140px rgba(0, 0, 0, 0.85)",
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 16, color: C.subtle }}>一个智能体</div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 60,
                fontWeight: 700,
                color: C.ink,
                marginTop: 6,
                letterSpacing: "-0.02em",
              }}
            >
              研究助理
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 26,
              }}
            >
              {["定时任务", "文件工具", "输出格式", "兜底规则"].map((tag) => (
                <div
                  key={tag}
                  style={{
                    fontFamily: SANS,
                    fontSize: 19,
                    color: C.ink,
                    border: `1px solid ${C.line}`,
                    background: C.panelLift,
                    borderRadius: 999,
                    padding: "8px 18px",
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 40,
                display: "flex",
                flexDirection: "column",
                gap: 22,
              }}
            >
              {[
                ["配置", "AGENTS.md · 14 行"],
                ["工具", "读文件 / 写文件 / 执行命令"],
                ["下一次运行", "明天 09:00"],
                ["回滚", "snapshots/v1 · 随时可回"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: SANS, fontSize: 17, color: C.subtle }}>{k}</div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 21,
                      color: C.ink,
                      marginTop: 4,
                    }}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: "auto",
                fontFamily: SANS,
                fontSize: 19,
                color: C.accent,
                borderTop: `1px solid ${C.lineSoft}`,
                paddingTop: 20,
              }}
            >
              改这段文字，它就换一个活法
            </div>
          </div>
        )}
      </div>

      {/* ── the line that carries the idea ── */}
      <div
        style={{
          position: "absolute",
          left: SAFE,
          right: SAFE,
          bottom: 44,
          fontFamily: SANS,
          fontSize: 46,
          fontWeight: 600,
          color: secondCaption ? C.ink : C.muted,
          opacity: interpolate(frame, [108, 124], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {secondCaption ? (
          <>
            所以想让它进化，<span style={{ color: C.accent }}>不用换模型</span>
            ，改这段文字就行。
          </>
        ) : (
          <>
            <span style={{ color: C.accent }}>写一段话</span>
            ，就是一个智能体。
          </>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Types out `text`, one character every `perChar` frames after `delay`. */
const typedLine = (text: string, frame: number, delay: number, perChar = 1.05) => {
  const n = Math.max(0, Math.floor((frame - delay) / perChar));
  return text.slice(0, Math.min(text.length, n));
};
