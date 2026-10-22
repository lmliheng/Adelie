/**
 * The base every shader visual in this package is built on: the WebGPU canvas from the `shaders`
 * package, or the stand-in its caller handed it when this device cannot draw one (`shader-support.ts`
 * decides which, and why).
 *
 * Two rules come with the box, both from the library's own contract:
 *
 * - **`className` sizes the box, never the canvas.** A shader canvas has no size of its own — it
 *   fills its container and follows it on resize — so the placement is a class on this element and
 *   the canvas is stretched inside it.
 * - **The box is `aria-hidden`.** An effect is decoration: it carries no text and nothing about it
 *   is worth announcing, in either mode.
 *
 * The stand-in is the caller's, because only the caller knows what its effect was for: this
 * component draws whatever it was handed, in the same box, with the same class.
 */
import type { ReactNode } from "react";
import { Shader } from "shaders/react";
import { useShaderSurfaceMode } from "../shader-support";

export interface ShaderSurfaceProps {
  /** Sizing and placement for the box the canvas fills — the canvas has no size of its own. */
  className?: string;
  /** The layers, bottom to top: the `shaders` package's own components, composed as siblings. */
  children?: ReactNode;
  /** What stands on the box without a working GPU, and under reduce-motion. */
  standIn?: ReactNode;
}

export function ShaderSurface({ className, children, standIn }: ShaderSurfaceProps) {
  const { mode, reportUnavailable } = useShaderSurfaceMode();
  return (
    <div className={className} aria-hidden="true">
      {mode === "gpu" ? (
        <Shader className="h-full w-full" onUnavailable={reportUnavailable}>
          {children}
        </Shader>
      ) : (
        standIn
      )}
    </div>
  );
}
