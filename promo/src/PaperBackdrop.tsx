import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, MONO } from "./theme";

/**
 * The paper the whole film is printed on (DESIGN.md §4 "背景").
 *
 * Two things replaced v1's pure black plus centre glow, because both of those were
 * brightest in the middle and faded out — which is exactly how v1 ended up looking
 * hollow around the edges:
 *
 *   1. a 32px grid, faint enough to read as paper rather than as a chart;
 *   2. edge text — fragments of the files an agent is actually made of, drifting
 *      from the top-left corner to the bottom-right, so no edge is ever empty.
 *
 * It is mounted once, outside every Sequence: the grid is continuous through scene
 * changes, which is what lets the film cut without dipping to black.
 */

const AGENT_FRAGMENT = [
  "# agents/default_agent/agent_state/AGENTS.md",
  "",
  "你是 Adelie 的研究助理。",
  "每天 09:00 汇总 arXiv 上 cs.CL 的新论文，",
  "按主题分组，每条不超过两行。",
  "写进 ~/notes/arxiv/YYYY-MM-DD.md。",
  "",
  "## 工具",
  "- 读：工作区里的一切文件",
  "- 写：只在 ~/notes 下",
  "",
  "## 说话",
  "只在聊天里报标题与条数；",
  "细节留给写下来的文件。",
];

const SKILL_FRAGMENT = [
  "---",
  "name: agent-optimization",
  "description: Improve an Agent State through",
  "  versioned scores and score-linked Traces",
  "  from a frozen Benchmark.",
  "---",
  "",
  "Each round starts from the Reference",
  "and tests a bounded, general Candidate.",
  "",
  "# skills/data-analysis/SKILL.md",
  "# skills/software-development/SKILL.md",
];

const Block: React.FC<{
  lines: string[];
  x: number;
  y: number;
  width: number;
  drift: number;
  opacity: number;
}> = ({ lines, x, y, width, drift, opacity }) => (
  <pre
    style={{
      position: "absolute",
      left: x + drift,
      top: y - drift * 0.6,
      width,
      margin: 0,
      color: C.ink,
      opacity,
      fontFamily: MONO,
      fontSize: 12,
      lineHeight: "20px",
      whiteSpace: "pre-wrap",
      letterSpacing: 0,
    }}
  >
    {lines.join("\n")}
  </pre>
);

export const PaperBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = frame * 0.02;

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(23,23,23,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(23,23,23,0.055) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          backgroundPosition: "-1px -1px",
        }}
      />
      <Block
        lines={AGENT_FRAGMENT}
        x={-140}
        y={-40}
        width={460}
        drift={drift}
        opacity={0.05}
      />
      <Block
        lines={SKILL_FRAGMENT}
        x={1560}
        y={540}
        width={520}
        drift={-drift}
        opacity={0.045}
      />
      <Block
        lines={AGENT_FRAGMENT.slice(0, 6)}
        x={620}
        y={900}
        width={520}
        drift={drift * 0.6}
        opacity={0.035}
      />
    </AbsoluteFill>
  );
};
