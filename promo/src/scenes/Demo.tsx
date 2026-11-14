import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { grow, push, rise, typed } from "../motion";
import { C, MONO, SANS } from "../theme";

/**
 * Scene 4 — 看见 (570–840). The interface is rebuilt, not screenshotted: a still
 * capture can't make tool calls grow one by one, and the whole point here is the
 * *time* a task takes. The window is 1728×880 and its bottom edge sits on the frame's
 * bottom edge, so the screen stands on the paper instead of floating in a void.
 */

const NAV = [
  "新建对话",
  "智能体",
  "模型库",
  "插件市场",
  "评估中心",
  "机器管理",
  "成本中心",
];

const TOOLS = [
  { name: "read_file", detail: "sales/2026-11.csv", ms: "0.4s" },
  { name: "exec_command", detail: "awk · 汇总", ms: "1.2s" },
  { name: "read_file", detail: "sales/2026-10.csv", ms: "0.2s" },
  { name: "write_file", detail: "reports/11月销售月报.docx", ms: "0.6s" },
  { name: "exec_command", detail: "chart · 3 张", ms: "3.1s" },
  { name: "read_file", detail: "reports/11月销售月报.docx", ms: "0.3s" },
];

const PROMPT = "整理 11 月销售月报，按地区分组，重点写华东。";

export const Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const prompt = typed(PROMPT, frame, 6, 1.1);
  const sent = frame >= 34;
  const cursorToSend = interpolate(frame, [10, 27], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const ripple = interpolate(frame, [27, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const done = frame >= 150;
  const toolCount = TOOLS.filter((_, i) => frame >= 62 + i * 12).length;

  return (
    <AbsoluteFill style={{ transform: `scale(${push(frame, 270)})` }}>
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 200,
          width: 1728,
          height: 880,
          background: C.paper,
          border: `1px solid ${C.line}`,
          borderRadius: "18px 18px 0 0",
          boxShadow: "0 30px 80px rgba(14, 28, 55, 0.10)",
          display: "flex",
          overflow: "hidden",
          ...rise(frame, fps, 0, 24),
        }}
      >
        {/* ── sidebar ── */}
        <div
          style={{
            width: 268,
            borderRight: `1px solid ${C.line}`,
            background: C.panel,
            display: "flex",
            flexDirection: "column",
            padding: "20px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingLeft: 6,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: C.navy,
                color: C.paper,
                fontFamily: SANS,
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              A
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 15,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              Adelie
            </div>
          </div>

          <div
            style={{
              marginTop: 26,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {NAV.map((item, i) => (
              <div
                key={item}
                style={{
                  fontFamily: SANS,
                  fontSize: 14,
                  color: i === 0 ? C.ink : C.muted,
                  background: i === 0 ? C.paper : "transparent",
                  border: `1px solid ${i === 0 ? C.line : "transparent"}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                {item}
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "auto",
              fontFamily: SANS,
              fontSize: 12,
              color: C.subtle,
              paddingLeft: 6,
            }}
          >
            内测版 · v0.6.8
          </div>
        </div>

        {/* ── main ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              height: 58,
              borderBottom: `1px solid ${C.line}`,
              display: "flex",
              alignItems: "center",
              padding: "0 24px",
              gap: 12,
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontSize: 15,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              销售月报
            </div>
            <div
              style={{
                marginLeft: "auto",
                fontFamily: SANS,
                fontSize: 12,
                color: C.muted,
                border: `1px solid ${C.line}`,
                borderRadius: 999,
                padding: "4px 10px",
              }}
            >
              本地运行
            </div>
          </div>

          <div style={{ flex: 1, padding: "26px 28px", position: "relative" }}>
            {sent && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  opacity: interpolate(frame, [38, 46], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                <div
                  style={{
                    maxWidth: 620,
                    background: C.panel,
                    border: `1px solid ${C.line}`,
                    borderRadius: 14,
                    padding: "12px 16px",
                    fontFamily: SANS,
                    fontSize: 15,
                    lineHeight: "24px",
                    color: C.ink,
                  }}
                >
                  {PROMPT}
                </div>
              </div>
            )}

            {sent && (
              <div style={{ marginTop: 26 }}>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 13,
                    color: done ? C.success : C.muted,
                    marginBottom: 12,
                  }}
                >
                  {done
                    ? "运行完毕 · 34s · 6 步"
                    : `运行中 · ${toolCount} / 6 步`}
                </div>
                {TOOLS.map((tool, i) => {
                  const at = 62 + i * 12;
                  if (frame < at) return null;
                  const ok = frame >= at + 8;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        height: 48,
                        borderBottom: `1px solid ${C.lineSoft}`,
                        opacity: interpolate(frame, [at, at + 5], [0, 1], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        }),
                        transform: `translateY(${interpolate(
                          frame,
                          [at, at + 6],
                          [-8, 0],
                          {
                            extrapolateLeft: "clamp",
                            extrapolateRight: "clamp",
                            easing: Easing.out(Easing.cubic),
                          },
                        )}px)`,
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          border: `1.5px solid ${ok ? C.success : C.subtle}`,
                          color: ok ? C.success : C.subtle,
                          fontFamily: SANS,
                          fontSize: 11,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {ok ? "✓" : ""}
                      </div>
                      <div
                        style={{ fontFamily: MONO, fontSize: 14, color: C.ink }}
                      >
                        {tool.name}
                      </div>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 13,
                          color: C.muted,
                        }}
                      >
                        {tool.detail}
                      </div>
                      <div
                        style={{
                          marginLeft: "auto",
                          fontFamily: MONO,
                          fontSize: 12,
                          color: C.subtle,
                        }}
                      >
                        {tool.ms}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {frame >= 156 && (
              <div
                style={{
                  marginTop: 18,
                  border: `1px solid ${C.line}`,
                  borderRadius: 14,
                  padding: "18px 20px",
                  background: C.paper,
                  width: 720,
                  opacity: grow(frame, fps, 156).opacity,
                  transform: `translateY(${interpolate(
                    frame,
                    [156, 170],
                    [16, 0],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: Easing.out(Easing.cubic),
                    },
                  )}px)`,
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "baseline", gap: 10 }}
                >
                  <div
                    style={{
                      fontFamily: SANS,
                      fontSize: 15,
                      fontWeight: 600,
                      color: C.ink,
                    }}
                  >
                    11 月销售月报
                  </div>
                  <div
                    style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}
                  >
                    .docx
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {[
                    { label: "华东", value: 1, note: "+12%" },
                    { label: "华南", value: 0.62, note: "+4%" },
                    { label: "华北", value: 0.41, note: "-3%" },
                  ].map((row, i) => {
                    const growP = interpolate(
                      frame,
                      [160 + i * 4, 172 + i * 4],
                      [0, 1],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: Easing.out(Easing.cubic),
                      },
                    );
                    return (
                      <div
                        key={row.label}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 34,
                            fontFamily: SANS,
                            fontSize: 13,
                            color: C.muted,
                          }}
                        >
                          {row.label}
                        </div>
                        <div
                          style={{
                            flex: 1,
                            height: 8,
                            background: C.panel,
                            borderRadius: 4,
                          }}
                        >
                          <div
                            style={{
                              width: `${row.value * 100 * growP}%`,
                              height: 8,
                              borderRadius: 4,
                              background: C.ink,
                              opacity: 0.85,
                            }}
                          />
                        </div>
                        <div
                          style={{
                            width: 46,
                            textAlign: "right",
                            fontFamily: MONO,
                            fontSize: 12,
                            color: row.note.startsWith("-") ? C.muted : C.ink,
                          }}
                        >
                          {row.note}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: `1px solid ${C.lineSoft}`,
                    fontFamily: SANS,
                    fontSize: 13,
                    color: C.subtle,
                  }}
                >
                  文件已写进工作区，可以直接打开
                </div>
              </div>
            )}
          </div>

          {/* ── composer ── */}
          <div style={{ padding: "0 28px 22px" }}>
            <div
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 14,
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: C.paper,
              }}
            >
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 15,
                  color: sent ? C.subtle : C.ink,
                }}
              >
                {sent ? "继续追问…" : prompt}
                {!sent && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 2,
                      height: 18,
                      background: C.accent,
                      verticalAlign: "-3px",
                      marginLeft: 2,
                      opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0,
                    }}
                  />
                )}
              </div>
              <div style={{ marginLeft: "auto", position: "relative" }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: C.ink,
                    color: C.paper,
                    fontFamily: SANS,
                    fontSize: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ↑
                </div>
                {/* the cursor slides to the button, then the ripple is the click */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: `1px solid ${C.accent}`,
                    opacity: ripple > 0 && ripple < 1 ? 1 - ripple : 0,
                    transform: `scale(${1 + ripple * 1.6})`,
                  }}
                />
                {frame >= 10 && frame < 30 && (
                  <div
                    style={{
                      position: "absolute",
                      left: interpolate(cursorToSend, [0, 1], [-480, 0]),
                      top: interpolate(cursorToSend, [0, 1], [-180, 0]),
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      background: C.accent,
                      opacity: 1 - ripple,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
