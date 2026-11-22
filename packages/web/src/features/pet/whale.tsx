/**
 * The pet's second figure: a fat blue whale.
 *
 * Same contract as the penguin next door, and for the same reasons: one inline SVG, fixed colours
 * (a whale is blue in either theme, and its pale belly is what makes it read against a dark
 * desktop), crisp at any size, and not one request in a window whose whole job is to be cheap.
 *
 * The two classes are the parts the stylesheet owns, exactly as they are on the penguin:
 * `.pet-eyes` blinks on its own cycle and `.pet-pupils` slides toward the pointer (the page writes
 * the offset onto the window's button as two custom properties). The shapes inside are this
 * figure's own — the bird's eyes are two rings high in a tall body, the whale's is one big eye
 * beside the mouth — but neither adds a path to the eye group, so the page's own code does not
 * care which figure it is drawing.
 *
 * WHERE THE LOOK COMES FROM. The owner asked for this one by pointing at the DeepSeek Harness
 * community's pet plugins, whose "DeepSeek whale" is the mascot of that ecosystem
 * (github.com/2002yxy/dsh-nailong-desktop-pet, MIT: `native/assets/deepseek-whale.svg`; also
 * github.com/xiaoshihou514/dsh-desktop-pet). Drawn here rather than copied: that whale is a
 * single-colour side profile of an official mark, while a pet needs an eye that can follow the
 * pointer and a belly that reads at 72 px. So this is its own fish — round, blue (#4d6bfe, the
 * blue of that family), one eye, a forked tail and a dorsal fin so it reads as a fish at a glance.
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
      <path d="M43 32c3-9 9-14 15-15-2 6-2 11-1 16z" fill="#3b52d4" />
      {/* Forked tail: two blades, the thing that says "fish" before anything else does. */}
      <path d="M79 50L97 28 90 57Z" fill="#3b52d4" />
      <path d="M79 63L97 85 88 59Z" fill="#3b52d4" />
      {/* Body: one round mass, head to the left. */}
      <path d="M24 57c0-17 14-30 31-30s30 13 30 30-13 31-30 31-31-14-31-31Z" fill="#4d6bfe" />
      {/* Belly. */}
      <path
        d="M37 52c8-3 18-2 25 3 6 4 8 12 4 19-5 9-17 13-27 10-9-3-14-12-12-20 1-6 5-10 10-12Z"
        fill="#e8edff"
      />
      {/* Pectoral fin. */}
      <path d="M52 81c5 5 11 7 17 6-4-4-7-9-8-15z" fill="#3b52d4" />
      {/* Mouth: the smile that makes it a companion rather than a diagram. */}
      <path
        d="M21 59c3 2 6 2 9 0"
        fill="none"
        stroke="#0f172a"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <g className="pet-eyes">
        <circle cx="37" cy="46" r="7" fill="#f8fafc" />
        <g className="pet-pupils">
          <circle cx="37" cy="47" r="3.2" fill="#0f172a" />
        </g>
      </g>
    </svg>
  );
}
