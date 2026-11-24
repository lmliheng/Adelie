/**
 * The one map from a figure's name to the component that draws it. The pet page looks up the
 * figure in force here, so adding a drawing is one file beside the others plus one name in
 * PET_FIGURES (lib/pet-figure.ts) — the page itself never names a drawing.
 *
 * A drawn figure is the same contract as the penguin: one inline SVG, the page's own size class,
 * and the two classes the stylesheet animates (`.pet-eyes`, `.pet-pupils`), which is why the page
 * does not care which one it is drawing. Only the penguin is one today — the drawn fish that used
 * to sit beside it was retired on 2026-11-24, when the owner asked for the community's
 * anthropomorphic "blue fat fish" instead of a second drawing of the fish itself.
 *
 * `picture` is the answer to that: it draws the reader's own image instead
 * (features/pet/picture.tsx), takes the page's size class the same way, and carries no eye classes
 * because there is nothing to animate — the pet still bobs, because that animation is on the page's
 * button.
 */
import type { ComponentType } from "react";
import type { PetFigure } from "../../lib/pet-figure";
import { Penguin } from "./penguin";
import { PetPicture } from "./picture";

export const PET_FIGURE_VIEWS: Record<PetFigure, ComponentType<{ className?: string }>> = {
  penguin: Penguin,
  picture: PetPicture,
};
