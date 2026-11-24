/**
 * The pet's figure as a live value (the decisions behind it are in lib/pet-figure.ts).
 *
 * `useSyncExternalStore` rather than a `useState` and a hand-written `storage` listener: the
 * subscribe function is the one place that follows a change, from this window and from another,
 * and React owns the re-render. The snapshot is the value read from storage — a string, so it is
 * stable between renders and cannot loop. The third argument makes the same read the server
 * snapshot, for the suites that render a component to static markup.
 */
import { useSyncExternalStore } from "react";
import { readPetFigure, readPetPicture, subscribePetFigure, writePetFigure } from "./pet-figure";
import type { PetFigure } from "./pet-figure";

/** The figure in force, and the writer for it. */
export function usePetFigure(): [PetFigure, (figure: PetFigure) => void] {
  return [useSyncExternalStore(subscribePetFigure, readPetFigure, readPetFigure), writePetFigure];
}

/**
 * The reader's own picture, as a live value: the `data:` URL the `picture` figure draws, or null
 * when none was chosen (the drawn penguin does not need it). Subscribed exactly as the figure is, so
 * a picture picked in the Settings window reaches the companion window by the same route.
 */
export function usePetPicture(): string | null {
  return useSyncExternalStore(subscribePetFigure, readPetPicture, readPetPicture);
}
