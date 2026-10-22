/**
 * The shader family: the table that decides between the GPU canvas and the stand-in, the box the
 * canvas fills (with the stand-in inside it), and the two backdrops.
 *
 * A canvas cannot be drawn in this suite's Node environment, so what is asserted here is what can
 * be: the decision itself as a pure function, the markup of the stand-in path, and the composition
 * of each backdrop read at the source — the layers, their props and where they are imported from.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { AuroraBackdrop } from "../src/components/shaders/aurora-backdrop/aurora-backdrop";
import { DotGridBackdrop } from "../src/components/shaders/dot-grid-backdrop/dot-grid-backdrop";
import { shaderRenderMode } from "../src/components/shaders/shader-support";
import type { ShaderRenderInput } from "../src/components/shaders/shader-support";
import { ShaderSurface } from "../src/components/shaders/shader-surface/shader-surface";
import { renderStatic } from "../src/testing";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const FAMILY = [
  "../src/components/shaders/shader-surface/shader-surface.tsx",
  "../src/components/shaders/aurora-backdrop/aurora-backdrop.tsx",
  "../src/components/shaders/dot-grid-backdrop/dot-grid-backdrop.tsx",
] as const;

describe("shaderRenderMode", () => {
  it("draws on the GPU for exactly one combination: supported, still running, motion allowed", () => {
    const rows: [ShaderRenderInput, string][] = [];
    for (const probe of ["unknown", "supported", "unsupported"] as const) {
      for (const reducedMotion of [false, true]) {
        for (const unavailable of [false, true]) {
          const input = { probe, reducedMotion, unavailable };
          rows.push([input, shaderRenderMode(input)]);
        }
      }
    }
    expect(rows.filter(([, mode]) => mode === "gpu")).toEqual([
      [{ probe: "supported", reducedMotion: false, unavailable: false }, "gpu"],
    ]);
  });
});

describe("ShaderSurface", () => {
  it("draws the caller's stand-in inside the box it was given, before any device is known", () => {
    const html = renderStatic(
      createElement(ShaderSurface, {
        className: "absolute inset-0",
        standIn: createElement("div", { className: "stand-in" }),
      }),
    );
    expect(html).toContain('class="absolute inset-0"');
    expect(html).toContain('class="stand-in"');
  });

  it("hides the box from assistive technology in both modes, and mounts no canvas here", () => {
    const html = renderStatic(createElement(ShaderSurface, {}));
    expect(html).toContain('aria-hidden="true"');
    // The suite has no DOM and no WebGPU: the canvas must not appear at all.
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("data-renderer");
  });

  it("mounts the library's canvas only on the GPU branch, stretched to the box", () => {
    const src = read("../src/components/shaders/shader-surface/shader-surface.tsx");
    expect(src).toMatch(/import \{ Shader \} from "shaders\/react";/);
    expect(src).toMatch(/mode === "gpu" \? \(/);
    expect(src).toMatch(/<Shader className="h-full w-full" onUnavailable=\{reportUnavailable\}>/);
  });
});

describe("the backdrops", () => {
  it("AuroraBackdrop stands in with the two colours it was handed, as one gradient", () => {
    const html = renderStatic(
      createElement(AuroraBackdrop, {
        className: "h-40 w-full",
        colorA: "#111827",
        colorB: "#3b82f6",
      }),
    );
    expect(html).toContain("linear-gradient(135deg, #111827, #3b82f6)");
    expect(html).toContain('class="h-40 w-full"');
    const src = read("../src/components/shaders/aurora-backdrop/aurora-backdrop.tsx");
    for (const layer of ["<MeshGradient", "<SimplexNoise", "<CursorTrail"])
      expect(src).toContain(layer);
    // The grain is on by default and the cursor trail is not: a page-wide trail is a personality.
    expect(src).toMatch(/grain = true/);
    expect(src).toMatch(/cursor = false/);
  });

  it("DotGridBackdrop stands in with the same dots drawn in CSS", () => {
    const html = renderStatic(
      createElement(DotGridBackdrop, { className: "h-40 w-full", color: "#94a3b8" }),
    );
    expect(html).toContain("radial-gradient(circle, #94a3b8 1px, transparent 1.5px)");
    expect(html).toContain('class="h-40 w-full"');
    const src = read("../src/components/shaders/dot-grid-backdrop/dot-grid-backdrop.tsx");
    expect(src).toMatch(/<DotGrid\s+color=\{color\}\s+density=\{density\}/);
    // A still grid is the default; the twinkle is the caller's choice.
    expect(src).toMatch(/twinkle = 0/);
  });

  it("hold no colour of their own: every colour is a required prop", () => {
    // A canvas cannot read a CSS custom property and no colour may leave the theme (deslop rule
    // 20), so a colour default here would be a colour outside every theme. Required, not optional.
    const aurora = read("../src/components/shaders/aurora-backdrop/aurora-backdrop.tsx");
    expect(aurora).toMatch(/colorA: string;/);
    expect(aurora).toMatch(/colorB: string;/);
    expect(aurora).not.toMatch(/colorA = "|colorB = "/);
    const grid = read("../src/components/shaders/dot-grid-backdrop/dot-grid-backdrop.tsx");
    expect(grid).toMatch(/\n {2}color: string;/);
    expect(grid).not.toMatch(/color = "/);
  });

  it("import their layers from the package, never from its dist or node_modules", () => {
    for (const file of FAMILY) {
      const src = read(file);
      expect(src, file).not.toMatch(/node_modules|shaders\/dist|\.\.\/\.\.\/\.\.\/\.\.\/\.\./);
    }
    for (const file of FAMILY.slice(1)) expect(read(file)).toContain('from "shaders/react"');
  });
});
