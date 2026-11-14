/**
 * Every colour in this film comes from Adelie's own default theme
 * (`packages/ui/src/themes/github.css`) and from the app icon — see DESIGN.md §4.
 * The one chromatic brand colour is the link blue; the saturated ring blue exists
 * only on the icon's orbit.
 */
export const C = {
  paper: "#ffffff",
  panel: "#fafafa",
  line: "#e5e5e5",
  lineSoft: "#efefef",
  ink: "#171717",
  muted: "#737373",
  subtle: "#a1a1a1",
  accent: "#0b57d0",
  accentWash: "rgba(11, 87, 208, 0.08)",
  accentLine: "rgba(11, 87, 208, 0.35)",
  ring: "#0258ee",
  navy: "#0e1c37",
  success: "#047857",
} as const;

/** System stack: no webfont, so an offline render can never fall back to tofu. */
export const SANS =
  '"Inter", "Helvetica Neue", Helvetica, Arial, "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
export const MONO =
  '"SFMono-Regular", Menlo, Consolas, "Noto Sans Mono CJK SC", "Noto Sans Mono", monospace';

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;
/** The one margin the whole film keeps (§4 "构图"). */
export const SAFE = 96;
