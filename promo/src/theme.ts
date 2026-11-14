/**
 * Two palettes, and only two.
 *
 * `C` is the film's own language — it is sampled from v1's frames rather than invented:
 * the canvas is pure black, the glow behind every hero object peaks at `#000f29`, cards
 * sit at `#0d0d0d` and the one chromatic note is the icon's blue, `#0258ee` for the
 * orbit and `#478eff` for emphasised words (measured `rgb(71,142,255)` in v1).
 *
 * `UI` is the app's own dark theme, copied from `packages/ui/src/themes/github.css`
 * `.dark` — canvas `#121212`, surface `#1a1a1a`, line `#262626`, ink `#d6d6d6`, link
 * `#8ab4f8`. Adelie follows `prefers-color-scheme`, so the window in scene 4 is the
 * interface a viewer on a dark desktop actually sees; nothing in it is invented.
 *
 * Keeping the two apart is the point: the interface stays truthful and neutral, the
 * film around it carries the brand. Merging them is what made the first cut read as a
 * slide deck — one palette cannot be both.
 */
export const C = {
  /** the film's canvas — pure black, sampled from v1 */
  canvas: "#000000",
  /** cards, windows and chips in the film's own language */
  panel: "#0d0d0d",
  panelLift: "#111111",
  line: "#1f1f1f",
  lineSoft: "#141414",
  ink: "#f2f3f5",
  muted: "#9b9ea3",
  subtle: "#6b6e73",
  /** brand blue, for the few words that carry the argument */
  accent: "#4a8cff",
  accentWash: "rgba(74, 140, 255, 0.12)",
  accentLine: "rgba(74, 140, 255, 0.42)",
  /** the icon's orbit — the app icon's saturated ring */
  ring: "#0258ee",
  /** the deep navy inside the icon's plate, also the glow's hue */
  navy: "#0e1c37",
  glow: "rgba(0, 15, 41, 1)",
  success: "#34d399",
} as const;

/** The app's real dark theme (`github.css` `.dark`). */
export const UI = {
  canvas: "#121212",
  surface: "#1a1a1a",
  surfaceMuted: "#202020",
  inset: "#0e0e0e",
  fill: "#262626",
  fg: "#d6d6d6",
  fgEmphasis: "#f0f0f0",
  muted: "#a1a1a1",
  subtle: "#8a8a8a",
  line: "#262626",
  lineEmphasis: "#333333",
  link: "#8ab4f8",
  success: "#6ee7b7",
  successLine: "rgba(16, 185, 129, 0.4)",
  danger: "#f87171",
  chrome: "#1f1f1f",
} as const;

/** System stack: no webfont, so an offline render can never fall back to tofu. */
export const SANS =
  '"Inter", "Helvetica Neue", Helvetica, Arial, "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
export const MONO =
  '"SFMono-Regular", Menlo, Consolas, "Noto Sans Mono CJK SC", "Noto Sans Mono", monospace';

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;
/** The film's one margin. Tightened from 96 to 64 in v3: with a black canvas a wide
 * margin reads as a void, so content now reaches closer to the edge. */
export const SAFE = 64;
