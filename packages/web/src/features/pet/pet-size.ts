/**
 * How big the pet is drawn, on this side of the shell.
 *
 * The size is the shell's preference (packages/desktop/src/pet-window.ts): it sizes the resting
 * window to fit the pet, and reports the chosen size back on the pet's status push so this page
 * can draw the figure at matching pixels. The numbers here therefore mirror the shell's
 * `PET_PET_PX` — the two have to move together, one reserving the room and the other filling it —
 * and the panel's own cap is derived from them rather than hard-coded, so the panel keeps exactly
 * the room it was measured with at every size.
 */
import type { DesktopPetSize } from "@adelie/server/api";

/** The three sizes, as the shell names them on the wire. */
export type PetSize = DesktopPetSize;

/** The sizes in the order the settings row offers them, smallest first. */
export const PET_SIZES: readonly PetSize[] = ["small", "medium", "large"];

/** The pet figure's own pixels, per size — the shell's `PET_PET_PX`, kept in step by hand. */
export const PET_SIZE_PX: Record<PetSize, number> = { small: 56, medium: 72, large: 96 };

/**
 * The room the panel may not take, in px, for a pet drawn at `petPx`: the panel's own gap and the
 * pet under it (76 at the medium size the window was measured with, pet-page.tsx), grown or shrunk
 * by however much the pet itself changed.
 */
export function petPanelReservePx(petPx: number): number {
  return 76 + petPx - PET_SIZE_PX.medium;
}
