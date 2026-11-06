/**
 * The question the Sandbox card asks when its switch is turned on and the machine has no
 * sandbox backend for its OS: install this OS's default ones? Install / Not now, plus "Don't
 * ask again" for this machine (lib/sandbox-backend-prompt.ts keeps that in this browser).
 *
 * The answer never touches the switch: it stays on in the card either way, and the card's Save
 * stores it. Installing goes through the Plugins page's own install, so it carries that page's
 * cost, which the body says: the App is re-assembled, stopping runs in progress.
 *
 * A run that did not install everything keeps this card open — `refusal` carries the reason and
 * the packages still missing (features/settings/sandbox-backend-refusal.ts), so the button that
 * retries them is the one under the sentence rather than a toast that is gone before it is read.
 */
import { useState } from "react";
import { Checkbox, ConfirmModal, ICONS } from "@adelie/ui";
import { S } from "../../lib/strings";

export function SandboxBackendPrompt({
  pkgs,
  machineName,
  busy,
  refusal,
  onInstall,
  onLater,
}: {
  /** The packages to offer, installed together; null keeps the dialog closed. */
  pkgs: readonly string[] | null;
  /** The machine the card is editing, as the picker names it. */
  machineName: string;
  busy: boolean;
  /** Why the last run left packages behind, and which ones — null when there is nothing to say. */
  refusal: string | null;
  onInstall: (dontAskAgain: boolean) => void;
  onLater: (dontAskAgain: boolean) => void;
}) {
  const [dontAsk, setDontAsk] = useState(false);
  const P = S.settings.sandboxBackendPrompt;
  return (
    <ConfirmModal
      open={pkgs !== null}
      title={P.title}
      tone="primary"
      glyph={ICONS.download}
      busy={busy}
      confirmLabel={busy ? P.installing : P.install}
      cancelLabel={P.later}
      onConfirm={() => onInstall(dontAsk)}
      onClose={() => onLater(dontAsk)}
      refusal={refusal === null ? undefined : refusal}
    >
      <div className="space-y-2 text-sm">
        <p>{P.body(machineName, pkgs ?? [])}</p>
        <p className="text-xs text-fg-muted">{P.cost}</p>
        <Checkbox checked={dontAsk} disabled={busy} label={P.dontAsk} onChange={setDontAsk} />
      </div>
    </ConfirmModal>
  );
}
