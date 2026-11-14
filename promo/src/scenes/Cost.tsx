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
 * Scene 7 — 放心 (1350–1515). Claim on the left, evidence on the right: a receipt that
 * behaves like one. The five bars are drawn at real relative durations (7.2s of fetching
 * against 0.9s of reading), and the digits count up, because a still number reads as a
 * screenshot. No blue: this scene is about being accountable, not about being clickable.
 */

const STEPS = [
  { label: "网页抓取", seconds: 7.2 },
  { label: "模型推理", seconds: 3.1 },
  { label: "文件读写", seconds: 1.4 },
  { label: "生成图表", seconds: 0.9 },
  { label: "整理目录", seconds: 0.4 },
];

export const Cost: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const max = STEPS[0]!.seconds;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 300,
          width: 780,
          ...rise(frame, fps, 0, 24),
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontSize: 58,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: C.ink,
            lineHeight: "80px",
          }}
        >
          每一步，
          <br />
          都算得清。
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: SANS,
            fontSize: 20,
            lineHeight: "34px",
            color: C.muted,
            maxWidth: 620,
          }}
        >
          耗时、token、花了多少钱，都记在这张账单上；
          跑完之后，任何一步都能翻回去看它当时做了什么。
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 1032,
          top: 168,
          width: 792,
          border: `1px solid ${C.line}`,
          borderRadius: 18,
          background: C.paper,
          padding: "26px 30px 30px",
          ...rise(frame, fps, 6, 26),
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ fontFamily: SANS, fontSize: 15, color: C.muted }}>
            本次任务
          </div>
          <div
            style={{
              marginLeft: "auto",
              fontFamily: MONO,
              fontSize: 13,
              color: C.subtle,
            }}
          >
            34s · 6 步
          </div>
        </div>

        <div style={{ display: "flex", gap: 44, marginTop: 18 }}>
          <Metric label="步骤" value={Math.round(roll(frame, 10, 34, 42))} />
          <Metric
            label="工具调用"
            value={Math.round(roll(frame, 14, 34, 18))}
          />
          <Metric
            label="tokens"
            value={Math.round(roll(frame, 18, 34, 128))}
            suffix="k"
          />
        </div>

        <div
          style={{
            marginTop: 22,
            paddingTop: 16,
            borderTop: `1px solid ${C.line}`,
            display: "flex",
            alignItems: "baseline",
            gap: 10,
          }}
        >
          <div style={{ fontFamily: SANS, fontSize: 14, color: C.muted }}>
            花了
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 46,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: "-0.02em",
            }}
          >
            ${roll(frame, 20, 34, 0.068).toFixed(3)}
          </div>
        </div>

        <div
          style={{
            marginTop: 22,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {STEPS.map((step, i) => {
            const growP = interpolate(frame, [24 + i * 4, 40 + i * 4], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });
            return (
              <div
                key={step.label}
                style={{ display: "flex", alignItems: "center", gap: 14 }}
              >
                <div
                  style={{
                    width: 92,
                    fontFamily: SANS,
                    fontSize: 14,
                    color: C.muted,
                  }}
                >
                  {step.label}
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 10,
                    background: C.panel,
                    borderRadius: 5,
                  }}
                >
                  <div
                    style={{
                      width: `${(step.seconds / max) * 100 * growP}%`,
                      height: 10,
                      borderRadius: 5,
                      background: C.ink,
                      opacity: 0.8,
                    }}
                  />
                </div>
                <div
                  style={{
                    width: 56,
                    textAlign: "right",
                    fontFamily: MONO,
                    fontSize: 13,
                    color: C.subtle,
                  }}
                >
                  {step.seconds.toFixed(1)}s
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          bottom: 72,
          fontFamily: SANS,
          fontSize: 16,
          color: C.muted,
          opacity: fade(frame, 90, 12),
        }}
      >
        数字是示意，账单的形状是真的：成本中心逐次记录每一次调用。
      </div>
    </AbsoluteFill>
  );
};

const Metric: React.FC<{ label: string; value: number; suffix?: string }> = ({
  label,
  value,
  suffix,
}) => (
  <div>
    <div style={{ fontFamily: SANS, fontSize: 13, color: C.muted }}>
      {label}
    </div>
    <div
      style={{
        fontFamily: MONO,
        fontSize: 38,
        fontWeight: 600,
        color: C.ink,
        letterSpacing: "-0.02em",
        marginTop: 2,
      }}
    >
      {value}
      {suffix ?? ""}
    </div>
  </div>
);
