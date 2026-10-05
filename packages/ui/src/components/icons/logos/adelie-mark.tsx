/**
 * The Adelie brand emblem inlined as a component: the penguin — the white ring around each eye is
 * the species' signature — standing inside the harness's blue orbit, on the white plate the app
 * icon draws it on.
 *
 * It lives here rather than being loaded from `packages/web/public/adelie-icon.svg`: that asset
 * belongs to the Web App (it is also the favicon), and the UI package must not depend on a
 * consumer's public directory. The plate is kept underneath rather than dropped — the penguin's
 * back is nearly black, so without it the mark would vanish against a dark surface; the visible
 * crop is drawn tighter than the asset's own square, because the asset carries padding meant for
 * an app icon and the mark is also drawn at 18px here.
 *
 * Decorative like the avatars that use it — the mark is never the name of the thing it is drawn
 * for — so it is `aria-hidden` and takes no label.
 *
 * `useId` keeps the gradient definitions distinct per instance (colour and bill reference them by
 * id, and a page holds hundreds of these); the colons React puts in its ids are stripped because
 * they are not valid inside an SVG `url(#…)` reference.
 */
import { useId } from "react";

/** The crop drawn inside the asset's 1024-unit square: the orbit (197–827 × 215–845) with a little air. */
const VIEW_BOX = "170 170 684 684";

export function AdelieMark({ size = 24, className }: { size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const body = `${uid}body`;
  const orbit = `${uid}orbit`;
  const bill = `${uid}bill`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      role="img"
      aria-hidden
      className={`shrink-0 ${className ?? ""}`}
    >
      <defs>
        <linearGradient
          id={body}
          x1="318"
          y1="225"
          x2="706"
          y2="840"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#1a2a49" />
          <stop offset=".5" stopColor="#0e1c37" />
          <stop offset="1" stopColor="#070f1e" />
        </linearGradient>
        <linearGradient
          id={orbit}
          x1="212"
          y1="830"
          x2="812"
          y2="230"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#0b2963" />
          <stop offset=".45" stopColor="#054ac8" />
          <stop offset="1" stopColor="#015dfc" />
        </linearGradient>
        <linearGradient
          id={bill}
          x1="474"
          y1="415"
          x2="550"
          y2="534"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#054ac8" />
          <stop offset="1" stopColor="#015dfc" />
        </linearGradient>
      </defs>

      {/* the plate: the white rounded square Adelie draws its penguin on (its own corners are cut
          by the caller's shape — the crop above never reaches them) */}
      <rect width="1024" height="1024" fill="#fefefe" />

      {/* orbit: the harness's blue sweep; the penguin stands in it, so only its two tails show */}
      <circle cx="512" cy="530" r="300" fill="none" stroke={`url(#${orbit})`} strokeWidth="30" />

      {/* the Adelie: bowling-pin silhouette, black back and head, white belly */}
      <path
        d="M 512 225 C 596 225 652 296 662 388 C 684 470 706 560 706 660 C 706 780 664 840 512 840
           C 360 840 318 780 318 660 C 318 560 340 470 362 388 C 372 296 428 225 512 225 Z"
        fill={`url(#${body})`}
      />
      <ellipse cx="512" cy="705" rx="124" ry="130" fill="#fefefe" />

      {/* the species' signature: the white ring around each eye */}
      <circle cx="448" cy="356" r="46" fill="none" stroke="#fefefe" strokeWidth="24" />
      <circle cx="576" cy="356" r="46" fill="none" stroke="#fefefe" strokeWidth="24" />

      {/* bill */}
      <path
        d="M 512 415 C 542 440 552 470 549 492 C 546 514 532 528 512 534 C 492 528 478 514 475 492
           C 472 470 482 440 512 415 Z"
        fill={`url(#${bill})`}
      />
    </svg>
  );
}
