/**
 * The one map from a figure's name to the component that draws it. The pet page looks up the
 * figure in force here, so adding a figure is one file beside the others plus one name in
 * PET_FIGURES (lib/pet-figure.ts) — the page itself never names a drawing.
 *
 * A figure is the same contract however it is made: one node filling the box the page hands it, and
 * the two classes the stylesheet animates (`.pet-eyes`, `.pet-pupils`) only if it has eyes to move.
 * The penguin is an inline SVG and carries them; `whaleGirl` is a shipped image and carries neither,
 * which is why the page does not care which one it is drawing.
 *
 * `picture` is the third: it draws the reader's own image instead (features/pet/picture.tsx), takes
 * the page's size class the same way, and falls back to the penguin when nothing was picked.
 */
import type { ComponentType } from "react";
import type { PetFigure } from "../../lib/pet-figure";
import { Penguin } from "./penguin";
import { PetPicture } from "./picture";
import { WhaleGirl } from "./whale-girl";

export const PET_FIGURE_VIEWS: Record<PetFigure, ComponentType<{ className?: string }>> = {
  penguin: Penguin,
  whaleGirl: WhaleGirl,
  picture: PetPicture,
};
