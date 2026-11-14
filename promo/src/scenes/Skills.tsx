import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { rise } from "../motion";
import { C, MONO, SANS } from "../theme";

/**
 * Scene 5 — 摸到底 (840–1080). Four cards, because the plugin library really is four
 * kinds; a list would read as a sequence, and these have no order. Every card carries
 * a file name in its corner, quietly repeating scene 3: these are files, not a black box.
 */

const CARDS = [
  {
    title: "技能即插件",
    body: "一个 Skill 就是一个 SKILL.md：写下来、装进库，市场里一键换成别人的。",
    file: "SKILL.md",
    preview: [
      "skills/data-analysis/SKILL.md",
      "skills/agent-optimization/SKILL.md",
    ],
    at: 0,
  },
  {
    title: "子代理并行",
    body: "拆出去的活同时开跑，主线程不等；每个子代理自己的上下文、自己的笔记。",
    file: "subagents",
    preview: ["子代理 A · 抓取 12 个页面", "子代理 B · 核对三份表"],
    at: 6,
  },
  {
    title: "定时任务",
    body: "每天 09:00 自己醒过来，跑完把结果留在该在的地方。",
    file: "schedule",
    preview: ["明天 09:00 · 研究助理", "昨天 09:00 · 用时 3m12s"],
    at: 12,
  },
  {
    title: "长期记忆",
    body: "记住你是谁、上次做到哪一步，下一轮不用把话再说一遍。",
    file: "memory",
    preview: ["偏好：中文 · 时区 CST", "上次：11 月月报做到华东"],
    at: 18,
  },
];

export const Skills: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 228,
          width: 1776,
          display: "grid",
          gridTemplateColumns: "876px 876px",
          gap: 24,
        }}
      >
        {CARDS.map((card) => (
          <div
            key={card.title}
            style={{
              height: 300,
              background: C.paper,
              border: `1px solid ${C.line}`,
              borderRadius: 18,
              padding: "28px 30px",
              display: "flex",
              flexDirection: "column",
              ...rise(frame, fps, card.at, 30),
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 25,
                  fontWeight: 600,
                  color: C.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                {card.title}
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.subtle,
                  border: `1px solid ${C.lineSoft}`,
                  borderRadius: 999,
                  padding: "4px 10px",
                }}
              >
                {card.file}
              </div>
            </div>
            <div
              style={{
                marginTop: 18,
                fontFamily: SANS,
                fontSize: 19,
                lineHeight: "32px",
                color: C.muted,
                maxWidth: 720,
              }}
            >
              {card.body}
            </div>
            <div
              style={{
                marginTop: "auto",
                borderTop: `1px solid ${C.lineSoft}`,
                paddingTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {card.preview.map((line) => (
                <div
                  key={line}
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    color: C.subtle,
                    paddingLeft: 2,
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
