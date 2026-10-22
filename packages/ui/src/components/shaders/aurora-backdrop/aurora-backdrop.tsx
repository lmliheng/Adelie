/**
 * A soft colour field that drifts on its own — the backdrop for a surface with nothing on it yet
 * (the new-chat page, a sign-in page, an empty Project): mesh-gradient swaths under a whisper of
 * noise, so the flat areas are not flat.
 *
 * **The colours are required props.** A GPU canvas cannot read a CSS custom property, so nothing
 * here can be a token, and a colour of this component's own would be a colour outside the theme:
 * the caller hands over the two it wants (the gallery reads the active theme's own ground and
 * accent off the frame root), which is how an app that wants its theme's colours does it too.
 *
 * `cursor` adds the library's trail behind the pointer. It is off by default: a page-wide backdrop
 * that answers the pointer is a personality, not a default, and it should only be switched on where
 * the pointer really is on the backdrop rather than on top of a dense UI.
 *
 * `speed` is the library's own 0–5 scale (0.6 is a slow drift); `grain` keeps the noise layer that
 * hides banding in the large, evenly-graded areas.
 */
import { CursorTrail, MeshGradient, SimplexNoise } from "shaders/react";
import { ShaderSurface } from "../shader-surface/shader-surface";

export interface AuroraBackdropProps {
  /** Sizing and placement; `absolute inset-0` is the usual one for a backdrop. */
  className?: string;
  /** The first colour, usually the theme's ground (`--ui-canvas`). Required: see the note above. */
  colorA: string;
  /** The second colour, usually the theme's accent (`--ui-accent`). Returns in the cursor trail. */
  colorB: string;
  /** Drift speed on the library's 0–5 scale. */
  speed?: number;
  /** The noise layer that hides banding in the graded areas. */
  grain?: boolean;
  /** A trail behind the pointer, for a backdrop that genuinely holds the pointer. */
  cursor?: boolean;
}

/** The library reads `oklab` here, so a two-stop gradient keeps its contrast through the middle
 * instead of greying out. */
const COLOR_SPACE = "oklab";

export function AuroraBackdrop({
  className,
  colorA,
  colorB,
  speed = 0.6,
  grain = true,
  cursor = false,
}: AuroraBackdropProps) {
  return (
    <ShaderSurface
      className={className}
      standIn={
        // The same two colours at a single angle: the resting frame of the field above, so a device
        // without a GPU shows the backdrop rather than a hole.
        <div
          className="h-full w-full"
          style={{ backgroundImage: `linear-gradient(135deg, ${colorA}, ${colorB})` }}
        />
      }
    >
      <MeshGradient colorA={colorA} colorB={colorB} colorSpace={COLOR_SPACE} speed={speed} />
      {grain && <SimplexNoise scale={3} speed={0.5} opacity={0.12} blendMode="softLight" />}
      {cursor && (
        <CursorTrail colorA={colorA} colorB={colorB} radius={0.3} length={0.4} opacity={0.5} />
      )}
    </ShaderSurface>
  );
}
