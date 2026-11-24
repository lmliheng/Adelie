/**
 * The pet's `picture` figure: the reader's own image, drawn as it is.
 *
 * The penguin beside it is this app's own shape (SVG); this one is whatever image the reader picked
 * in the Appearance row, so there is nothing to draw — the question the page asks of every figure
 * ("draw yourself in this box") is answered with the image itself, contained so its aspect ratio
 * survives the square the pet is. It is the figure the owner asked for on 2026-11-24, when he sent
 * the community's anthropomorphic "blue fat fish" and asked the pet to be her rather than a second
 * drawing of the fish: the character is fan art of someone else's mark, so what ships is the way to
 * put a picture of her there, not the picture.
 *
 * IT OWNS ONE MORE ANSWER THAN THE PENGUIN: what a `picture` figure is when there is no picture.
 * The choice lives in one `localStorage` key and the image in another, so they can disagree — a
 * fresh browser, a cleared store, a value a later release could not read. The drawn penguin stands
 * in rather than an empty box on someone's desktop, the same way an unknown figure name falls back
 * to the bird (lib/pet-figure.ts).
 *
 * The image is not draggable on purpose: the pet is the window's handle, and a browser's own image
 * drag would take the pointer gesture away from the page that moves the window.
 */
import { usePetPicture } from "../../lib/use-pet-figure";
import { Penguin } from "./penguin";

export function PetPicture({ className }: { className?: string }) {
  const picture = usePetPicture();
  if (picture === null) return <Penguin className={className} />;
  return (
    <img
      src={picture}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`${className ?? ""} object-contain`}
    />
  );
}
