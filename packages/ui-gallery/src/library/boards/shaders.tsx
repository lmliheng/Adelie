/**
 * Shaders: the WebGPU backdrops, on the two things that decide them — the device and the reader's
 * motion preference. The board shows what a caller passes in (the active theme's own colours, read
 * from this frame's root), the two backdrops side by side, and what the box is drawing right now:
 * a canvas, or the stand-in that costs nothing on a machine that cannot draw one.
 */
import { useEffect, useState } from "react";
import { AuroraBackdrop, DotGridBackdrop } from "@adelie/ui";
import { BoardGroup } from "../../foundations/shared";
import { useGallery } from "../../state";
import { readShaderColors } from "../shader-colors";
import type { ShaderColors } from "../shader-colors";

function read(): ShaderColors {
  const computed = getComputedStyle(document.documentElement);
  return readShaderColors((name) => computed.getPropertyValue(name));
}

/** The theme's colours, read from this frame's root and re-read when its theme attributes change. */
function useShaderColors(): ShaderColors | null {
  const [colors, setColors] = useState<ShaderColors | null>(null);
  useEffect(() => {
    const update = () => setColors(read());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-accent", "style"],
    });
    return () => observer.disconnect();
  }, []);
  return colors;
}

/**
 * Which of the two the box is drawing, read off the box itself: the GPU's canvas is in it, or its
 * absence is the stand-in. Observed rather than predicted — the support probe and the device are
 * both async, and a device can refuse the composition after the canvas already mounted.
 *
 * The box comes in as state, not as a ref: the board waits for the theme's colours before it
 * renders it, so a ref would still be empty at mount and the effect would never run again.
 *
 * The first two seconds belong to the device: an empty box there means "not asked yet", not "no
 * canvas", because the probe has not answered. A canvas that goes away again is the device's own
 * answer (`onUnavailable`, device lost), so it is read at once — in a browser with a software
 * WebGPU adapter the canvas appears and is refused a beat later, which is what showed both halves:
 * the line has to follow it down as well, or it keeps saying "a GPU canvas" over a stand-in.
 */
function useDrawnBy(element: HTMLDivElement | null): "gpu" | "static" | null {
  const [drawn, setDrawn] = useState<"gpu" | "static" | null>(null);
  useEffect(() => {
    if (!element) return;
    let settled = false;
    let hadCanvas = false;
    const read = (): "gpu" | "static" => (element.querySelector("canvas") ? "gpu" : "static");
    const check = () => {
      if (read() === "gpu") {
        hadCanvas = true;
        setDrawn("gpu");
      } else if (hadCanvas || settled) {
        setDrawn("static");
      }
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(element, { childList: true, subtree: true });
    const settle = window.setTimeout(() => {
      settled = true;
      check();
    }, 2000);
    return () => {
      observer.disconnect();
      window.clearTimeout(settle);
    };
  }, [element]);
  return drawn;
}

export function ShadersBoard() {
  const { S } = useGallery();
  const t = S.library.shaders;
  const colors = useShaderColors();
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const drawn = useDrawnBy(box);

  if (!colors) return <p className="gf-muted">{S.intro.resolving}</p>;

  return (
    <div className="gf-board">
      <BoardGroup title={t.aurora} aside={t.auroraHint}>
        <div ref={setBox} className="lib-box h-40 w-full max-w-xl">
          <AuroraBackdrop
            className="h-full w-full"
            colorA={colors.ground}
            colorB={colors.accent}
            cursor
          />
        </div>
      </BoardGroup>
      <BoardGroup title={t.grid} aside={t.gridHint}>
        <div className="lib-row">
          {[0, 0.6].map((twinkle) => (
            <span key={twinkle} className="lib-cell w-64">
              <span className="lib-box block h-32 w-64">
                <DotGridBackdrop className="h-full w-full" color={colors.line} twinkle={twinkle} />
              </span>
              <span className="lib-caption">{twinkle === 0 ? t.gridStill : t.gridTwinkle}</span>
            </span>
          ))}
        </div>
      </BoardGroup>
      <BoardGroup title={t.drawing} aside={drawn === null ? t.drawingPending : undefined}>
        <p className="lib-caption">
          {drawn === "gpu" ? t.drawingGpu : drawn === "static" ? t.drawingStatic : ""}
        </p>
        <p className="lib-caption">{t.standInHint}</p>
      </BoardGroup>
    </div>
  );
}
