# A family of GPU backdrops, with a static stand-in in the same colours

- **Date:** 2026-10-22
- **Type:** feat
- **Scope:** `ui`, `ui-gallery`
- **Breaking:** no

[中文版](2026-10-22-shader-backdrops.zh.md)

The component library (`@adelie/ui`) gains a family of backdrops: a **colour field** that drifts on its own
(two colours moving through oklab under a whisper of noise, with an optional trail behind the pointer) and a
**dot grid** (one colour, one pitch — engineering paper, still or twinkling). They are built on MIT's
[`shaders`](https://www.npmjs.com/package/shaders) and drawn with WebGPU.

What matters most about them is not the look but that they **never leave a hole**: the box first asks whether
this device can draw at all (the WebGPU probe, plus the system's reduce-motion setting), and when it cannot it
puts the caller's stand-in into the same box — a flat gradient in the same colours, or a row of CSS dots. A
device that takes the canvas away mid-flight (out of memory, a lost driver) falls back at once. The first frame
is always the stand-in: the probe is asynchronous, and guessing it would make the page flicker.

Colours are **required props with no default of their own**: a GPU canvas cannot read a CSS custom property, so
the caller hands in the active theme's values. The gallery gains a "Shaders" topic that drives both blocks from
the active theme's ground, accent and separator ink, and reports whether the box is drawing a canvas or the
stand-in right now.

## Details

- `packages/ui/src/components/shaders/`: `shader-support.ts` (the decision table as a pure function, plus a hook
  that probes only after mount), `shader-surface/shader-surface.tsx` (the box; `<Shader>` only on the GPU branch,
  and `aria-hidden`), `aurora-backdrop/` (MeshGradient + SimplexNoise + optional CursorTrail),
  `dot-grid-backdrop/` (DotGrid, still or twinkling).
- Gallery: the new `shaders` topic (`topics.ts` / `boards.tsx` / `boards/shaders.tsx` / `shader-colors.ts` and
  both dictionaries).
- Dependency: `shaders@^4.0.5`, only in `@adelie/ui`; the Web app's release bundle carries none of it (unused, and
  tree-shaken away).

## Compatibility

- No API, data, config-format or existing-component change: this family is new.
- **No page uses them yet**; they are available and visible in the gallery first.
