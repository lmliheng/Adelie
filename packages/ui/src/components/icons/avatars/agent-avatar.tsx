/**
 * An agent's avatar.
 *
 * An agent has no picture of its own, so it draws the Adelie mark — the same brand emblem the app
 * icon and the account's own default avatar carry. This used to be a letter tile: the agent's
 * initial as coloured ink on a hue hashed from its id. That told agents apart at a glance, but it
 * also made every agent a different colour of the same placeholder, and a product whose agents are
 * its subject should sign them with its own mark (user decision, 2026-10-06: "默认智能体头像改成
 * Adelie 图标").
 *
 * `id` and `name` stay in the signature — every call site passes them, and a caller that knows an
 * agent's name is not wrong to say so — but the mark needs neither. The letter-tile helpers in
 * `avatar.ts` are still what `ProviderLogo` draws a user-defined model group with.
 */
import { AdelieMark } from "../logos/adelie-mark";

export function AgentAvatar({
  size = 18,
  className,
}: {
  /** The agent's id. No longer drawn; kept so call sites stay as they are. */
  id: string;
  /** Display name. No longer drawn, for the reason above. */
  name?: string;
  size?: number;
  className?: string;
}) {
  return <AdelieMark size={size} className={`rounded-full ${className ?? ""}`} />;
}
