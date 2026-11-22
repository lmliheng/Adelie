/**
 * The one map from a figure's name to the component that draws it. The pet page looks up the
 * figure in force here, so adding a drawing is one file beside the others plus one name in
 * PET_FIGURES (lib/pet-figure.ts) — the page itself never names a drawing.
 *
 * Each component is the same contract as the penguin: one inline SVG, the page's own size class,
 * and the two classes the stylesheet animates (`.pet-eyes`, `.pet-pupils`), which is why the page
 * does not care which one it is drawing.
 */
import type { ComponentType } from "react";
import type { PetFigure } from "../../lib/pet-figure";
import { Penguin } from "./penguin";
import { Whale } from "./whale";

export const PET_FIGURE_VIEWS: Record<PetFigure, ComponentType<{ className?: string }>> = {
  penguin: Penguin,
  whale: Whale,
};
