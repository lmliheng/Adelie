/**
 * A faint dot grid — engineering paper under a surface that should not read as empty, without
 * decorating it. Where `AuroraBackdrop` is about colour, this one is about structure: one colour,
 * one pitch, and nothing moving unless the caller asks for `twinkle`.
 *
 * `color` is a required prop, for the same reason as everywhere in this family — a GPU canvas
 * cannot read a CSS custom property, so nothing here can be a token and nothing here can carry a
 * colour of its own. The caller hands one in: the theme's own line or muted-ink colour at a low
 * `opacity` is what keeps the grid faint in both modes.
 *
 * `density` counts dots down the canvas (the width fits as many as the aspect ratio allows), so the
 * pitch follows the box; `dotSize` is the library's 0–1 share of a cell.
 */
import { DotGrid } from "shaders/react";
import { ShaderSurface } from "../shader-surface/shader-surface";

export interface DotGridBackdropProps {
  /** Sizing and placement; `absolute inset-0` is the usual one for a backdrop. */
  className?: string;
  /** The dot colour, required: the theme's line or muted ink reads right in either mode. */
  color: string;
  /** Dots down the canvas height (1–200). */
  density?: number;
  /** Each dot's share of its cell, 0–1. */
  dotSize?: number;
  /** Dot opacity, 0–1: the grid's faintness, independent of its colour. */
  opacity?: number;
  /** Per-dot twinkle intensity, 0–1; 0 is a still grid. */
  twinkle?: number;
}

export function DotGridBackdrop({
  className,
  color,
  density = 30,
  dotSize = 0.22,
  opacity = 0.5,
  twinkle = 0,
}: DotGridBackdropProps) {
  return (
    <ShaderSurface
      className={className}
      standIn={
        // The still grid, drawn with CSS: the same colour, dots at their library default of 30 down
        // the box, on a square pitch.
        <div
          className="h-full w-full"
          style={{
            backgroundImage: `radial-gradient(circle, ${color} 1px, transparent 1.5px)`,
            backgroundSize: "calc(100% / 30) calc(100% / 30)",
            opacity,
          }}
        />
      }
    >
      <DotGrid
        color={color}
        density={density}
        dotSize={dotSize}
        opacity={opacity}
        twinkle={twinkle}
      />
    </ShaderSurface>
  );
}
