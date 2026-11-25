/**
 * The pet's three sizes on the web side (features/pet/pet-size.ts).
 *
 * The numbers here are the shell's own (`PET_PET_PX` in packages/desktop/src/pet-window.ts): the
 * shell sizes its window from them and this page draws the figure at them, so a drift between the
 * two is a figure that does not fill the room it was given. The panel's reserve is derived from the
 * same number rather than hard-coded, so it still holds when the pet is not at the size the window
 * was measured with.
 */
import { describe, expect, it } from "vitest";
import { PET_SIZES, PET_SIZE_PX, petPanelReservePx } from "../src/features/pet/pet-size";

describe("the pet's sizes", () => {
  it("offers the three sizes, smallest first", () => {
    expect(PET_SIZES).toEqual(["small", "medium", "large"]);
  });

  it("draws each at the shell's own pixels", () => {
    // Kept in step with packages/desktop/src/pet-window.ts by hand; the desktop suite pins the same
    // three numbers from its side.
    expect(PET_SIZE_PX).toEqual({ small: 56, medium: 72, large: 96 });
  });

  it("reserves the panel's room plus the pet, growing with the pet", () => {
    // The resting window was measured with 76px reserved for the gap and the pet at medium.
    expect(petPanelReservePx(PET_SIZE_PX.medium)).toBe(76);
    expect(petPanelReservePx(PET_SIZE_PX.small)).toBe(76 - 16);
    expect(petPanelReservePx(PET_SIZE_PX.large)).toBe(76 + 24);
  });
});
