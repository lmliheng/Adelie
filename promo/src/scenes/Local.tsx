import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { rise } from "../motion";
import { C, MONO, SANS } from "../theme";

/**
 * Scene 8 — 敢用 (1515–1650). "Files never leave this machine" is a claim, and a
 * technical viewer immediately asks two questions: where is the data, and who gets the
 * key. The frame is a machine — one border with everything hugging its inside — so the
 * edges are the point rather than empty margin.
 */

const PROVIDERS = [
  "Claude",
  "GPT",
  "Gemini",
  "DeepSeek",
  "Qwen",
  "Moonshot",
  "Ollama",
];

export const Local: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grow = interpolate(frame, [0, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          top: 150,
          bottom: 90,
          border: `1px solid ${C.line}`,
          borderRadius: 26,
          opacity: 0.4 + grow * 0.6,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 34,
            top: -12,
            background: C.paper,
            padding: "0 12px",
            fontFamily: SANS,
            fontSize: 14,
            color: C.muted,
          }}
        >
          你这台电脑
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 96,
          top: 232,
          width: 1728,
          ...rise(frame, fps, 4, 26),
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontSize: 64,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: C.ink,
            lineHeight: "86px",
          }}
        >
          文件不出这台电脑。
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: SANS,
            fontSize: 24,
            lineHeight: "40px",
            color: C.muted,
            maxWidth: 1400,
          }}
        >
          智能体、工作区、密钥都在你自己的机器上；模型随你换，接哪个供应商由你决定。
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 96,
          top: 466,
          display: "flex",
          gap: 24,
          opacity: interpolate(frame, [14, 32], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {[
          { k: "智能体与工作区", v: "~/.adelie/data" },
          { k: "密钥", v: "agent_state/.vault.toml" },
          { k: "模型请求", v: "只发给你选的那一家" },
        ].map((row) => (
          <div
            key={row.k}
            style={{
              width: 552,
              border: `1px solid ${C.line}`,
              borderRadius: 14,
              background: C.panel,
              padding: "20px 22px",
            }}
          >
            <div style={{ fontFamily: SANS, fontSize: 15, color: C.muted }}>
              {row.k}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 19,
                color: C.ink,
                marginTop: 8,
              }}
            >
              {row.v}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          bottom: 196,
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        {PROVIDERS.map((name, i) => (
          <div
            key={name}
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 999,
              background: C.panel,
              padding: "12px 22px",
              fontFamily: SANS,
              fontSize: 18,
              color: C.ink,
              opacity: interpolate(frame, [26 + i * 3, 40 + i * 3], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              transform: `translateY(${interpolate(
                frame,
                [26 + i * 3, 40 + i * 3],
                [10, 0],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              )}px)`,
            }}
          >
            {name}
          </div>
        ))}
        <div
          style={{
            marginLeft: "auto",
            fontFamily: SANS,
            fontSize: 16,
            color: C.subtle,
            alignSelf: "center",
          }}
        >
          以及 1000+ 兼容 OpenAI 协议的端点
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 96,
          height: 1,
          background: C.line,
        }}
      />
    </AbsoluteFill>
  );
};
