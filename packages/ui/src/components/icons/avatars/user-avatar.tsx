/**
 * An account's avatar, wherever it is drawn: a navigation row, a collapsed rail's trigger, an
 * account menu's header, a profile page's preview.
 *
 * Two states, one component. With an avatar stored it is that image, cropped to the circle;
 * without one it is the Adelie mark — the account has not said who it is, so it is the app that
 * answers, rather than a letter disc that would be a name (the first letter of the nickname, or
 * of the id) dressed up as a picture. The stored image still wins: the mark is the default, not a
 * badge.
 *
 * `size` is in pixels and the mark is scaled to it, rather than both coming from the type scale:
 * the disc is a fixed box, so a mark that grew with the user's font-size setting would outgrow it
 * at the largest tier.
 */
import type { CSSProperties, ReactNode } from "react";
import { AdelieMark } from "../logos/adelie-mark";

/**
 * The sizes a user avatar is drawn at, named by the slot rather than by the number (the
 * `ICON_SIZE` convention). `tile` is what a navigation row, a rail and a menu header share — the
 * three must stay identical, because collapsing a sidebar swaps one for another and a changed
 * size would pop. `preview` is a profile page, where the avatar is the subject.
 */
export const USER_AVATAR_SIZE = { tile: 28, preview: 64 } as const;

export function UserAvatar({
  avatar,
  size = USER_AVATAR_SIZE.tile,
  className,
  children,
}: {
  /** The account's id. Unused while no image is stored — the mark carries no initial. */
  userId: string;
  /** Nickname, when set. Unused while no image is stored, for the reason above. */
  displayName?: string;
  /** Stored avatar as a URL (a data URL from a profile upload); absent, the Adelie mark is drawn. */
  avatar?: string;
  /** Edge length in pixels — pass a `USER_AVATAR_SIZE` rung. */
  size?: number;
  className?: string;
  /** Overlay slot, positioned against this disc: a trigger hangs its update dot here. */
  children?: ReactNode;
}) {
  const box: CSSProperties = { width: size, height: size };
  if (avatar !== undefined) {
    return (
      <span className={`relative block shrink-0 ${className ?? ""}`} style={box}>
        {/* object-cover, though a stored avatar is usually square already: one written by an API
            client rather than by a cropping upload must still fill the circle, not stretch into
            it. alt="" because the mark below is decorative too: the avatar is never the account's
            name — every anchor it sits in already names the account. */}
        <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" style={box} />
        {children}
      </span>
    );
  }
  return (
    <span className={`relative block shrink-0 ${className ?? ""}`} style={box}>
      <AdelieMark size={size} className="rounded-full" />
      {children}
    </span>
  );
}
