/**
 * The pet itself: an Adelie penguin, drawn as one inline SVG.
 *
 * Inline rather than an image file on purpose — it has to be crisp at any size, follow the
 * window's shape without a canvas, and cost no request in a window whose whole job is to be
 * cheap. Fixed colours, not theme tokens: a penguin is black, white and orange in either theme,
 * and the light belly is what makes it read against a dark desktop too.
 *
 * The bob is a CSS animation (styles.css, `.pet-bob`), so the global reduced-motion rule turns it
 * off with every other animation in the app and leaves a still penguin standing.
 */
export function Penguin({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 108"
      role="img"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Head, back and flippers: one black silhouette. */}
      <path
        d="M50 2c17 0 29 13 29 31 0 6-1 11-3 16 6 5 10 13 12 23 2 11 2 22 0 29-1 4-5 6-9 5-6-2-12-3-18-3h-22c-6 0-12 1-18 3-4 1-8-1-9-5-2-7-2-18 0-29 2-10 6-18 12-23-2-5-3-10-3-16C21 15 33 2 50 2Z"
        fill="#1f2937"
      />
      {/* Belly. */}
      <path
        d="M50 22c11 0 19 9 19 24 0 14-1 26-3 38-1 6-8 9-16 9s-15-3-16-9c-2-12-3-24-3-38 0-15 8-24 19-24Z"
        fill="#f8fafc"
      />
      {/* The white eye-ring is the Adelie's own marking: the one detail that says which penguin. */}
      <circle cx="40" cy="24" r="5.5" fill="#f8fafc" />
      <circle cx="60" cy="24" r="5.5" fill="#f8fafc" />
      <circle cx="40" cy="24" r="2.6" fill="#0f172a" />
      <circle cx="60" cy="24" r="2.6" fill="#0f172a" />
      {/* Beak and feet. */}
      <path d="M50 30l7 5-7 5-7-5 7-5Z" fill="#f59e0b" />
      <path d="M33 99h16l-3 7H34l-1-7Z" fill="#f59e0b" />
      <path d="M51 99h16l1 7H52l-1-7Z" fill="#f59e0b" />
    </svg>
  );
}
