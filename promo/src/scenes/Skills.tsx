import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { rise } from "../motion";
import { C, MONO, SAFE, SANS } from "../theme";

/**
 * Scene 5 — 摸到底 (840–1080). Four cards, because the library really is four kinds; a
 * list would read as a sequence and these have no order. Each card keeps a file name in
 * its corner, quietly repeating scene 3: these are files, not a black box.
 *
 * v2 laid the cards on white with 25px titles and no heading, which is why the frame read
 * as a form. v3 lifts them onto `#0d0d0d` panels lit from the left, puts the claim above
 * them at 62px, and gives every card a mono preview so there is something to read.
 */

const CARDS = [
  {
    title: "技能即插件",
    body: "一个 Skill 就是一个 SKILL.md：写下来、装进库，市场里一键换成别人的。",
    note: "装一个技能，就是给智能体加一门手艺。",
    file: "SKILL.md",
    preview: [
      "skills/data-analysis/SKILL.md",
      "skills/agent-optimization/SKILL.md",
      "skills/software-engineering/SKILL.md",
    ],
    at: 0,
  },
  {
    title: "子代理并行",
    body: "拆出去的活同时开跑，主线程不等；每个子代理自己的上下文、自己的笔记。",
    note: "大任务自动拆小，各自带着自己的笔记跑。",
    file: "subagents",
    preview: ["子代理 A · 抓取 12 个页面", "子代理 B · 核对三份表", "主线程 · 继续和你对话"],
    at: 6,
  },
  {
    title: "定时任务",
    body: "每天 09:00 自己醒过来，跑完把结果留在该在的地方。",
    note: "按分钟、按天执行：早报、巡检、监控。",
    file: "schedule",
    preview: ["明天 09:00 · 研究助理", "昨天 09:00 · 用时 3m12s", "上周一 · 巡检 4 个仓库"],
    at: 12,
  },
  {
    title: "长期记忆",
    body: "记住你是谁、上次做到哪一步，下一轮不用把话再说一遍。",
    note: "偏好、项目和决定都记着，下次开口不用解释。",
    file: "memory",
    preview: ["偏好：中文 · 时区 CST", "上次：11 月月报做到华东", "项目：adelie / notes"],
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
          left: SAFE,
          top: 76,
          ...rise(frame, fps, 0, 20),
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
          能力
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
          它不只是一块聊天框。
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: SAFE,
          top: 252,
          width: 1792,
          display: "grid",
          gridTemplateColumns: "884px 884px",
          gap: 24,
        }}
      >
        {CARDS.map((card) => (
          <div
            key={card.title}
            style={{
              height: 300,
              background: C.panel,
              border: `1px solid ${C.line}`,
              borderRadius: 18,
              padding: "28px 32px",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 30px 90px rgba(0,0,0,0.75)",
              ...rise(frame, fps, card.at, 34),
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 32,
                  fontWeight: 700,
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
                  fontSize: 15,
                  color: C.subtle,
                  border: `1px solid ${C.line}`,
                  borderRadius: 999,
                  padding: "5px 12px",
                }}
              >
                {card.file}
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                fontFamily: SANS,
                fontSize: 22,
                lineHeight: "36px",
                color: C.muted,
                maxWidth: 760,
              }}
            >
              {card.body}
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: SANS,
                fontSize: 19,
                lineHeight: "30px",
                color: C.subtle,
              }}
            >
              {card.note}
            </div>
            <div
              style={{
                marginTop: "auto",
                borderTop: `1px solid ${C.lineSoft}`,
                paddingTop: 16,
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
                    fontSize: 16,
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

      <div
        style={{
          position: "absolute",
          left: SAFE,
          right: SAFE,
          bottom: 58,
          fontFamily: SANS,
          fontSize: 22,
          color: C.subtle,
        }}
      >
        技能 · 子代理 · 定时任务 · 长期记忆 —— 都在你自己的机器上跑
      </div>
    </AbsoluteFill>
  );
};
