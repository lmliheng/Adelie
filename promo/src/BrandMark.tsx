import React from "react";
import { C } from "./theme";

/**
 * The app icon, drawn from the brand master's own geometry (white plate, navy Adelie
 * penguin with its white eye rings, blue orbit) — DESIGN.md §3.1. `arc` is 0..1 of the
 * orbit that has been drawn, `spin` is the slow rotation in degrees.
 */
export const BrandMark: React.FC<{
  size: number;
  arc?: number;
  spin?: number;
  scale?: number;
}> = ({ size, arc = 1, spin = 0, scale = 1 }) => {
  const plate = size * 0.66;
  const r = size * 0.5;
  const circumference = 2 * Math.PI * (r - 4);
  const drawn = Math.max(0, Math.min(1, arc)) * circumference * 0.84;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        transform: `scale(${scale})`,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <g transform={`rotate(${spin} ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r - 4}
            fill="none"
            stroke={C.ring}
            strokeWidth={size * 0.034}
            strokeLinecap="round"
            strokeDasharray={`${drawn} ${circumference}`}
          />
        </g>
      </svg>
      <svg
        width={plate}
        height={plate}
        viewBox="0 0 200 200"
        style={{
          position: "absolute",
          left: (size - plate) / 2,
          top: (size - plate) / 2,
          filter: "drop-shadow(0 18px 40px rgba(14, 28, 55, 0.16))",
        }}
      >
        <rect
          x={1}
          y={1}
          width={198}
          height={198}
          rx={46}
          fill={C.paper}
          stroke={C.line}
          strokeWidth={2}
        />
        {/* body: narrow at the head, wide at the feet */}
        <path
          d="M100 50c-22 0-38 22-40 52-2 32 14 56 40 56s42-24 40-56c-2-30-18-52-40-52z"
          fill={C.navy}
        />
        {/* belly */}
        <ellipse cx={100} cy={128} rx={25} ry={32} fill={C.paper} />
        {/* eyes: the white ring around them is the species' mark */}
        <circle cx={84} cy={90} r={14} fill={C.paper} />
        <circle cx={116} cy={90} r={14} fill={C.paper} />
        <circle cx={84} cy={91} r={6.5} fill={C.navy} />
        <circle cx={116} cy={91} r={6.5} fill={C.navy} />
        {/* beak */}
        <path d="M100 104l8 12-8 9-8-9z" fill={C.ring} />
      </svg>
    </div>
  );
};
