import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Backdrop } from "./Backdrop";
import { sceneOpacity } from "./motion";
import { C } from "./theme";
import { Open } from "./scenes/Open";
import { Thesis } from "./scenes/Thesis";
import { TextAgent } from "./scenes/TextAgent";
import { Demo } from "./scenes/Demo";
import { Skills } from "./scenes/Skills";
import { Evolve } from "./scenes/Evolve";
import { Cost } from "./scenes/Cost";
import { Local } from "./scenes/Local";
import { Close } from "./scenes/Close";

/**
 * The film's single timeline (DESIGN.md §2 and §7). Adding a scene, or changing how
 * long one runs, happens here and nowhere else: every scene reads its own local frame
 * from its `Sequence`, so the numbers in this array are the only clocks in the film.
 */
export const SCENES = [
  { id: "open", from: 0, to: 120, Scene: Open },
  { id: "thesis", from: 120, to: 270, Scene: Thesis },
  { id: "text", from: 270, to: 570, Scene: TextAgent },
  { id: "demo", from: 570, to: 840, Scene: Demo },
  { id: "skills", from: 840, to: 1080, Scene: Skills },
  { id: "evolve", from: 1080, to: 1350, Scene: Evolve },
  { id: "cost", from: 1350, to: 1515, Scene: Cost },
  { id: "local", from: 1515, to: 1650, Scene: Local },
  { id: "close", from: 1650, to: 1800, Scene: Close },
] as const;

export const TOTAL_FRAMES = 1800; // 60.0s @ 30fps

/** No overlap: `sceneOpacity` snaps each scene in, so neighbours must not co-render. */
export const OVERLAP = 0;

/** Fades a scene in and out without ever going through black (§5 "场景进出"). */
const SceneSlot: React.FC<{
  duration: number;
  body: number;
  children: React.ReactNode;
}> = ({ duration, body, children }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, duration, body) }}>{children}</AbsoluteFill>
  );
};

export const Promo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.canvas, overflow: "hidden" }}>
    <Backdrop />
    {SCENES.map(({ id, from, to, Scene }) => (
      <Sequence
        key={id}
        from={from}
        durationInFrames={Math.min(to - from + OVERLAP, TOTAL_FRAMES - from)}
        name={id}
      >
        <SceneSlot duration={to - from + OVERLAP} body={to - from}>
          <Scene />
        </SceneSlot>
      </Sequence>
    ))}
  </AbsoluteFill>
);
