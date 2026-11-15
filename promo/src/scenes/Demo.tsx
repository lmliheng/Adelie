import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { push, rise, typed } from "../motion";
import { C, MONO, SANS, UI } from "../theme";

/**
 * Scene 4 — 看见 (570–840).
 *
 * v2 ran the window edge-to-edge on white paper; v1 floated it on black, and that is the
 * single biggest difference in how the film reads. v3 floats it again — 1720 wide, 100px
 * of black on every side, one long shadow under it — and then renders the interior with
 * the app's own dark theme (`github.css` `.dark`, copied into `UI`): canvas `#121212`,
 * surface `#1a1a1a`, line `#262626`, ink `#d6d6d6`. Adelie follows the system's dark
 * mode, so this is the window a viewer on a dark desktop actually has.
 *
 * The interface is still rebuilt rather than screenshotted: the point of the scene is the
 * *time* a task takes, and a still capture cannot make six tool calls grow one by one.
 */

const NAV = ["新建对话", "智能体", "模型库", "插件市场", "评估中心", "机器管理", "成本中心"];

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
          left: 100,
          top: 92,
          width: 1720,
          height: 896,
          background: UI.canvas,
          border: `1px solid ${UI.line}`,
          borderRadius: 16,
          boxShadow: "0 60px 140px rgba(0, 0, 0, 0.85)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          ...rise(frame, fps, 0, 30),
        }}
      >
        {/* ── title bar ── */}
        <div
          style={{
            height: 52,
            background: UI.chrome,
            borderBottom: `1px solid ${UI.line}`,
            display: "flex",
            alignItems: "center",
            padding: "0 18px",
            gap: 8,
          }}
        >
          {["#ff5f57", "#febc2e", "#28c840"].map((dot) => (
            <div
              key={dot}
              style={{
                width: 13,
                height: 13,
                borderRadius: 13,
                background: dot,
                opacity: 0.85,
              }}
            />
          ))}
          <div
            style={{
              flex: 1,
              textAlign: "center",
              fontFamily: SANS,
              fontSize: 16,
              color: UI.subtle,
            }}
          >
            Adelie · default
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: `1px solid ${UI.line}`,
              borderRadius: 999,
              padding: "5px 14px",
              fontFamily: SANS,
              fontSize: 14,
              color: UI.muted,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: 7,
                background: UI.success,
              }}
            />
            本地运行
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* ── sidebar ── */}
          <div
            style={{
              width: 316,
              borderRight: `1px solid ${UI.line}`,
              background: UI.surface,
              display: "flex",
              flexDirection: "column",
              padding: "18px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "4px 8px",
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: C.navy,
                  color: "#ffffff",
                  fontFamily: SANS,
                  fontSize: 14,
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
                  fontSize: 18,
                  fontWeight: 600,
                  color: UI.fgEmphasis,
                }}
              >
                default
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              {NAV.map((item, i) => (
                <div
                  key={item}
                  style={{
                    fontFamily: SANS,
                    fontSize: 17,
                    color: i === 0 ? UI.fgEmphasis : UI.muted,
                    background: i === 0 ? UI.surfaceMuted : "transparent",
                    borderRadius: 7,
                    padding: "9px 10px",
                  }}
                >
                  {item}
                </div>
              ))}
            </div>

            <div
              style={{
                margin: "22px 0 10px",
                paddingLeft: 10,
                fontFamily: SANS,
                fontSize: 13,
                letterSpacing: "0.1em",
                color: UI.subtle,
              }}
            >
              最近
            </div>
            {["整理 11 月销售月报", "竞品官网调研", "简历投递跟进"].map((t, i) => (
              <div
                key={t}
                style={{
                  fontFamily: SANS,
                  fontSize: 16,
                  color: i === 0 ? UI.fg : UI.subtle,
                  background: i === 0 ? UI.surfaceMuted : "transparent",
                  borderRadius: 7,
                  padding: "9px 10px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {t}
              </div>
            ))}

            <div
              style={{
                marginTop: "auto",
                fontFamily: SANS,
                fontSize: 13,
                color: UI.subtle,
                paddingLeft: 10,
              }}
            >
              内测版 · v0.6.8
            </div>
          </div>

          {/* ── main ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                height: 54,
                borderBottom: `1px solid ${UI.line}`,
                display: "flex",
                alignItems: "center",
                padding: "0 26px",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 18,
                  fontWeight: 600,
                  color: UI.fgEmphasis,
                }}
              >
                整理 11 月销售月报
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid ${done ? UI.successLine : UI.line}`,
                  background: done ? "rgba(16, 185, 129, 0.10)" : UI.surfaceMuted,
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontFamily: SANS,
                  fontSize: 14,
                  color: done ? UI.success : UI.muted,
                }}
              >
                {done ? "✓ 运行完毕 · 34s · 6 步" : `运行中 · ${toolCount} / 6 步`}
              </div>
            </div>

            <div style={{ flex: 1, padding: "22px 30px", position: "relative" }}>
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
                      maxWidth: 700,
                      background: UI.surfaceMuted,
                      border: `1px solid ${UI.line}`,
                      borderRadius: 14,
                      padding: "13px 18px",
                      fontFamily: SANS,
                      fontSize: 19,
                      lineHeight: "30px",
                      color: UI.fg,
                    }}
                  >
                    {PROMPT}
                  </div>
                </div>
              )}

              {sent && (
                <div style={{ marginTop: 20 }}>
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
                          gap: 14,
                          height: 52,
                          borderBottom: `1px solid ${UI.line}`,
                          opacity: interpolate(frame, [at, at + 5], [0, 1], {
                            extrapolateLeft: "clamp",
                            extrapolateRight: "clamp",
                          }),
                          transform: `translateY(${interpolate(frame, [at, at + 6], [-10, 0], {
                            extrapolateLeft: "clamp",
                            extrapolateRight: "clamp",
                            easing: Easing.out(Easing.cubic),
                          })}px)`,
                        }}
                      >
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            border: `1.5px solid ${ok ? UI.success : UI.subtle}`,
                            color: ok ? UI.success : UI.subtle,
                            fontFamily: SANS,
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {ok ? "✓" : ""}
                        </div>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 18,
                            color: UI.fgEmphasis,
                            width: 190,
                          }}
                        >
                          {tool.name}
                        </div>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 17,
                            color: UI.muted,
                          }}
                        >
                          {tool.detail}
                        </div>
                        <div
                          style={{
                            marginLeft: "auto",
                            fontFamily: MONO,
                            fontSize: 15,
                            color: UI.subtle,
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
                    marginTop: 16,
                    border: `1px solid ${UI.line}`,
                    borderRadius: 14,
                    padding: "18px 22px",
                    background: UI.surface,
                    width: 760,
                    opacity: interpolate(frame, [156, 168], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                    transform: `translateY(${interpolate(frame, [156, 172], [16, 0], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: Easing.out(Easing.cubic),
                    })}px)`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <div
                      style={{
                        fontFamily: SANS,
                        fontSize: 18,
                        fontWeight: 600,
                        color: UI.fgEmphasis,
                      }}
                    >
                      11 月销售月报
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 14,
                        color: UI.subtle,
                      }}
                    >
                      .docx
                    </div>
                    <div
                      style={{
                        marginLeft: "auto",
                        fontFamily: SANS,
                        fontSize: 14,
                        color: UI.muted,
                      }}
                    >
                      已写进工作区
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
                      const growP = interpolate(frame, [160 + i * 4, 172 + i * 4], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: Easing.out(Easing.cubic),
                      });
                      return (
                        <div
                          key={row.label}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                          }}
                        >
                          <div
                            style={{
                              width: 40,
                              fontFamily: SANS,
                              fontSize: 16,
                              color: UI.muted,
                            }}
                          >
                            {row.label}
                          </div>
                          <div
                            style={{
                              flex: 1,
                              height: 9,
                              background: UI.fill,
                              borderRadius: 5,
                            }}
                          >
                            <div
                              style={{
                                width: `${row.value * 100 * growP}%`,
                                height: 9,
                                borderRadius: 5,
                                background: UI.link,
                              }}
                            />
                          </div>
                          <div
                            style={{
                              width: 52,
                              textAlign: "right",
                              fontFamily: MONO,
                              fontSize: 15,
                              color: row.note.startsWith("-") ? UI.subtle : UI.success,
                            }}
                          >
                            {row.note}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── composer ── */}
            <div style={{ padding: "0 30px 20px" }}>
              <div
                style={{
                  border: `1px solid ${UI.lineEmphasis}`,
                  borderRadius: 14,
                  padding: "13px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: UI.surface,
                }}
              >
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 18,
                    color: sent ? UI.subtle : UI.fg,
                  }}
                >
                  {sent ? "继续追问…" : prompt}
                  {!sent && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 2,
                        height: 22,
                        background: UI.link,
                        verticalAlign: "-4px",
                        marginLeft: 2,
                        opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0,
                      }}
                    />
                  )}
                </div>
                <div style={{ marginLeft: "auto", position: "relative" }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: UI.fill,
                      color: UI.fgEmphasis,
                      fontFamily: SANS,
                      fontSize: 18,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ↑
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: `1px solid ${UI.link}`,
                      opacity: ripple > 0 && ripple < 1 ? 1 - ripple : 0,
                      transform: `scale(${1 + ripple * 1.6})`,
                    }}
                  />
                  {frame >= 10 && frame < 30 && (
                    <div
                      style={{
                        position: "absolute",
                        left: interpolate(cursorToSend, [0, 1], [-520, 0]),
                        top: interpolate(cursorToSend, [0, 1], [-200, 0]),
                        width: 16,
                        height: 16,
                        borderRadius: 9,
                        background: "#ffffff",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.8)",
                        opacity: 1 - ripple,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
