/**
 * The pet's second figure: the blue fat fish the DeepSeek community made of the logo.
 *
 * Same contract as the penguin next door, and for the same reasons: one inline SVG, fixed colours
 * (a fish is blue in either theme, and its pale belly is what makes it read against a dark
 * desktop), crisp at any size, and not one request in a window whose whole job is to be cheap.
 *
 * The two classes are the parts the stylesheet owns, exactly as they are on the penguin:
 * `.pet-eyes` blinks on its own cycle and `.pet-pupils` slides toward the pointer (the page writes
 * the offset onto the window's button as two custom properties). Neither adds a path to the eye
 * group, so the page's own code does not care which figure it is drawing.
 *
 * WHERE THE LOOK COMES FROM. DeepSeek's logo is a blue whale, and the community's pet name for it
 * is the "blue fat fish" (蓝色大肥鱼) — the owner sent that nickname's reference sheet and asked
 * this figure to be it: fatter and rounder than a whale, in the logo's own blue, with big eyes.
 * Drawn here rather than copied: the community's drawings are fan art of someone else's marks, and
 * a pet needs two things a copied picture cannot give — an eye that can follow the pointer and a
 * pale belly that still reads at 72 px. So this is its own fish: one round mass, #4d6bfe (the blue
 * of that family), a fin on the back, a forked tail, and a face big enough to see across a desktop.
 *
 * THE NAME IT KEEPS. The figure is still called `whale` here and in lib/pet-figure.ts, because
 * that is the string browsers have already stored under `penguin.petFigure` — rename it and every
 * desktop that had picked this fish quietly falls back to the penguin.
 */
export function Whale({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 108"
      role="img"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Dorsal fin. */}
      <path d="M42 38c3-13 11-21 21-23-2 8-3 15-1 22z" fill="#3b52d4" />
      {/* Forked tail: one fin with two lobes and the notch between them, the thing that says
          "fish" before anything else does. Its leading edge starts inside the body, so only the
          lobes show — the same trick the penguin's flippers use. */}
      <path
        d="M74 49c7-9 13-14 19-17-4 10-7 20-8 31.5 1 11.5 4 21.5 8 31.5-6-3-12-8-19-17z"
        fill="#3b52d4"
      />
      {/* Pectoral fin, low on the near side. */}
      <path d="M32 81c-8 5-12 13-11 20 5-5 12-8 19-9z" fill="#3b52d4" />
      {/* Body: one fat round mass — the whole point of the nickname. */}
      <path
        d="M48 30C67.9 30 84 45 84 63.5C84 82 67.9 97 48 97C28.1 97 12 82 12 63.5C12 45 28.1 30 48 30Z"
        fill="#4d6bfe"
      />
      {/* Belly: the pale bowl that carries the weight of "fat". */}
      <path
        d="M44 58c13 0 23 9 23 19 0 10-8 17-23 17s-23-7-23-17c0-10 10-19 23-19Z"
        fill="#e8edff"
      />
      {/* Mouth: the smile that makes it a companion rather than a diagram. */}
      <path
        d="M37 68c3 3 7 3 10 0"
        fill="none"
        stroke="#0f172a"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <g className="pet-eyes">
        <circle cx="34" cy="46" r="8.5" fill="#f8fafc" />
        <circle cx="58" cy="46" r="8.5" fill="#f8fafc" />
        <g className="pet-pupils">
          <circle cx="34" cy="47" r="4" fill="#0f172a" />
          <circle cx="58" cy="47" r="4" fill="#0f172a" />
        </g>
      </g>
    </svg>
  );
}
