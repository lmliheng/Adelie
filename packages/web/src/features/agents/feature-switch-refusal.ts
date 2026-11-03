/**
 * The enable switch at the head of an Agent settings tab (Memory's own, and the one shared by
 * Skills / Vault / Schedules / Hooks), and the line a refusal leaves under its card.
 *
 * None of these switches moves optimistically: the switch shows the position the server answered
 * with, so a refused flip leaves the card exactly as it was — the switch in its old position, the
 * tab unchanged — and the reason used to live only in a toast that dismissed itself after six
 * seconds. Six seconds later the switch simply looked as if it had been pressed and come back, with
 * nothing on screen saying why; that is the shape 7.19 bans app-wide, and this is the page where
 * the switch gates the whole feature below it (memory not entering the context, no hooks assembled
 * into a new Session, an unreachable vault).
 *
 * The sentence names the direction that failed, and it has to: the switch is still in the other
 * position, so "why is it still off" and "why is it still on" are two different sentences, and
 * naming the wrong one would say something the person never asked for. The noun is the feature's
 * own (`switchNoun` beside each `enable` label), not that label — every label already begins with
 * "启用" / "Enable", and reading it back inside a sentence about turning it on says it twice.
 */
import { S } from "../../lib/strings";

/** The line a refused flip leaves under the switch's card: the feature, which way it was asked to move, and the server's reason as it gave it. */
export function featureSwitchRefused(noun: string, enabled: boolean, reason: string): string {
  return enabled ? S.agent.switchOnRefused(noun, reason) : S.agent.switchOffRefused(noun, reason);
}
