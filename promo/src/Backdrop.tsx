import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C } from "./theme";

/**
 * The room the film is shot in.
 *
 * v1 got this right by accident and v2 got it wrong on purpose: what makes a black frame
 * read as depth rather than as an empty slide is a single deep-navy glow behind whatever
 * is being looked at, fading to true black at the edges. Measured from v1's frames the
 * glow peaks at `rgb(0, 15, 41)` in the middle of a 1920×1080 frame and is gone by
 * x≈240 / x≈1680 — so the corners are genuinely black and the frame never looks fogged.
 *
 * Two additions since v1, both about the "四周太空洞" note:
 *   1. the glow is wide (an ellipse, not a circle) so it spans the frame's width;
 *   2. a 24px dot field at 4% gives the black a texture to catch the light, which is what
 *      stops a large dark area from reading as an empty one on a projector.
 *
 * Mounted once, outside every Sequence, so it is continuous across cuts.
 */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const driftX = Math.sin(frame / 220) * 26;
  const driftY = Math.cos(frame / 300) * 14;

  return (
    <AbsoluteFill style={{ backgroundColor: C.canvas, overflow: "hidden" }}>
      {/* the dot field */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          backgroundPosition: "0px 0px",
          opacity: 0.55,
        }}
      />
      {/* the glow: a wide ellipse, drifting by a few pixels over the minute */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(1080px 620px at calc(50% + ${driftX}px) calc(46% + ${driftY}px), rgba(0, 20, 55, 0.95) 0%, rgba(0, 15, 41, 0.7) 34%, rgba(0, 10, 28, 0.3) 62%, rgba(0, 0, 0, 0) 82%)`,
        }}
      />
      {/* a second, cooler halo so the ellipse does not have a visible edge */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(760px 420px at calc(50% + ${driftX * 0.6}px) calc(46% + ${driftY * 0.6}px), rgba(2, 88, 238, 0.10) 0%, rgba(2, 88, 238, 0.04) 45%, rgba(0, 0, 0, 0) 76%)`,
        }}
      />
    </AbsoluteFill>
  );
};
