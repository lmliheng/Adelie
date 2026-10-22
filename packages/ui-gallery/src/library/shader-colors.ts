/**
 * The active theme's colours, for the shader backdrops.
 *
 * A GPU canvas cannot read a CSS custom property, so a shader colour is always a string the caller
 * passes in. The gallery reads those strings from the frame root's own computed style — the theme
 * under test, since the frame carries the page's theme attributes — and the backdrops take them as
 * props, which is also how an app that wants its theme's colours does it.
 *
 * Pure over a getter, so a test can drive it with a stub, exactly like the chart tokens' reader.
 */

export interface ShaderColors {
  /** The page's own ground (`--ui-canvas`): the aurora's first colour, the surface it drifts on. */
  ground: string;
  /** The theme's accent (`--ui-accent`): the aurora's second colour. */
  accent: string;
  /** The separator ink (`--ui-line`): the dot grid's colour, faint by nature in every theme. */
  line: string;
}

export const SHADER_COLOR_TOKENS: Readonly<Record<keyof ShaderColors, string>> = {
  ground: "--ui-canvas",
  accent: "--ui-accent",
  line: "--ui-line",
};

export function readShaderColors(getValue: (name: string) => string): ShaderColors {
  const value = (name: string) => getValue(name).trim();
  return {
    ground: value(SHADER_COLOR_TOKENS.ground),
    accent: value(SHADER_COLOR_TOKENS.accent),
    line: value(SHADER_COLOR_TOKENS.line),
  };
}
