/**
 * Display names for the device audit trail. The server writes each row with the writer's own
 * identifier — `paired`, `shell`, `bridge_lost`, or the state a report moved the phone into
 * (`offline`) — and this list says it in the reader's language. Refusals arrive combined as
 * `<action>:denied` / `<action>:needs-approval`, so they keep the base name and add why.
 *
 * A row whose identifier this build has no name for (a bridge reporting an event a newer
 * protocol minted) falls back to the identifier itself: the audit row is the only record of it,
 * so it is shown rather than hidden.
 *
 * Looked up per call rather than at module scope: `S` is swapped on a language change.
 */
import { S } from "../../lib/strings";

const DENIED = ":denied";
const NEEDS_APPROVAL = ":needs-approval";

/** What an audit row's action reads as; `kind` stands in when the writer recorded no action. */
export function auditActionLabel(action: string | null | undefined, kind: string): string {
  const raw = action ?? kind;
  if (raw.endsWith(DENIED)) return S.devices.audit.denied(baseLabel(raw.slice(0, -DENIED.length)));
  if (raw.endsWith(NEEDS_APPROVAL))
    return S.devices.audit.needsApproval(baseLabel(raw.slice(0, -NEEDS_APPROVAL.length)));
  return baseLabel(raw);
}

/** Who the row is attributed to: the system itself is an actor, not a person's name. */
export function auditActorLabel(actor: string | null | undefined): string {
  return actor === null || actor === undefined || actor === "system"
    ? S.devices.audit.bySystem
    : actor;
}

function baseLabel(action: string): string {
  const labels = S.devices.audit.actions as Record<string, string>;
  // A reported state change carries the state itself, whose words the card already uses.
  return labels[action] ?? (S.devices.state as Record<string, string>)[action] ?? action;
}
