/**
 * Which of the two things a shader visual draws: the WebGPU canvas, or the static stand-in the
 * caller handed it.
 *
 * Shaders is WebGPU-only, and its canvas has nothing to announce when it cannot start, so the
 * decision is made here rather than left to the library: a decorative background must never be
 * the reason a page looks broken.
 *
 * - **The probe.** `getWebGPUSupport()` asks the browser for an adapter — cheap, side-effect-free
 *   and cached for the page by the library — and that answer, not the bare presence of
 *   `navigator.gpu`, is what matters: a blocklisted driver, a headless browser or a machine whose
 *   device request fails all leave a canvas that stays transparent for good. A probe that throws
 *   is read as "not supported": the stand-in is the safe side of that call.
 * - **Reduce motion.** The library renders every frame and no prop stops it, so a reader who asked
 *   their system for less motion gets the stand-in — the resting frame — rather than motion that
 *   has to be endured.
 * - **The first paint is always the stand-in.** The probe is async, and guessing it would flip the
 *   markup after hydration; the stand-in costs one paint and is usually what a caller wanted on
 *   screen first anyway.
 *
 * `reportUnavailable` is the canvas's own word: the library calls `onUnavailable` when this device
 * cannot run the composition after all (device lost, out of memory, a limit exceeded), and the
 * surface then falls back to the stand-in for good.
 */
import { useCallback, useEffect, useState } from "react";
import { getWebGPUSupport } from "shaders/react";
import { usePrefersReducedMotion } from "../../motion/use-reduced-motion";

/** What a shader visual draws right now. */
export type ShaderRenderMode = "static" | "gpu";

/** The page's WebGPU verdict, before it is known. */
export type ShaderProbe = "unknown" | "supported" | "unsupported";

export interface ShaderRenderInput {
  probe: ShaderProbe;
  reducedMotion: boolean;
  /** The canvas reported that this device cannot run it (`Shader`'s `onUnavailable`). */
  unavailable: boolean;
}

/** The decision table, as a pure function: only a live, permitted, still-running device draws. */
export function shaderRenderMode({
  probe,
  reducedMotion,
  unavailable,
}: ShaderRenderInput): ShaderRenderMode {
  return probe === "supported" && !reducedMotion && !unavailable ? "gpu" : "static";
}

export interface ShaderSurfaceMode {
  mode: ShaderRenderMode;
  /** The canvas could not run: stay on the stand-in. */
  reportUnavailable: () => void;
}

/**
 * The live form of the table: probes once after mount (never during a render, so the stand-in is
 * what the server and the first paint produce), and remembers a refusal from the canvas.
 */
export function useShaderSurfaceMode(): ShaderSurfaceMode {
  const reducedMotion = usePrefersReducedMotion();
  const [probe, setProbe] = useState<ShaderProbe>("unknown");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    // Asking for an adapter under reduce-motion would be work for an answer nothing uses.
    if (reducedMotion) return;
    let alive = true;
    getWebGPUSupport()
      .then((info) => {
        if (alive) setProbe(info.supported ? "supported" : "unsupported");
      })
      .catch(() => {
        if (alive) setProbe("unsupported");
      });
    return () => {
      alive = false;
    };
  }, [reducedMotion]);

  const reportUnavailable = useCallback(() => setUnavailable(true), []);
  return { mode: shaderRenderMode({ probe, reducedMotion, unavailable }), reportUnavailable };
}
