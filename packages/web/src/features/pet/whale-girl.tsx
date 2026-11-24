/**
 * The pet's `whaleGirl` figure: the blue-haired whale girl, drawn from the illustration the owner
 * sent on 2026-11-24 (cut to a transparent background in `pet-pictures/`, beside the app's own
 * repo rather than inside it before then).
 *
 * WHY A SHIPPED IMAGE AND NOT A DRAWING. The penguin beside it is this app's own shape (SVG,
 * `penguin.tsx`); this one is a character the community drew, and the owner asked for HER rather
 * than for another drawing of the fish. It is the app's second figure, so it is a file the app
 * carries — unlike the `picture` figure, which draws whatever image the reader picked and needs
 * nothing bundled.
 *
 * A figure is one box the page asks to draw itself in: the same `className` the penguin takes, and
 * no eye classes, because there is nothing here for the pointer to move — the pet still bobs, since
 * that animation is on the page's own button. The image is not draggable on purpose: the pet is the
 * window's handle, and a browser's own image drag would take the pointer gesture away from the page
 * that moves the window.
 */
export function WhaleGirl({ className }: { className?: string }) {
  return (
    <img
      src="/pet-figures/whale-girl.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`${className ?? ""} object-contain`}
    />
  );
}
