/**
 * Settings › Server › Agent API (admin only): "Allow the Agent API", the server-wide switch over
 * every Agent's public API (`agentApiEnabled` in /api/admin/settings, on by default). Off, every
 * request to the API is refused; each Agent's own switch, approval mode and keys are kept.
 *
 * The switch applies on the flip, like Chrome extension connections'. Turning it on writes at
 * once. Turning it off asks first, in the danger tone — every program calling an Agent fails from
 * then on — and the knob stays on until the answer is yes. That card closes only once its write
 * landed; one the server refused keeps the card with the reason drawn inside it, so the retry is
 * the button that was just pressed rather than a line under the switch the card had left behind.
 * A write that fails on the way on puts the knob back on the stored value and says why under it.
 */
import { useEffect, useState } from "react";
import type { ServerSettingsResponse } from "@adelie/server/api";
import { ConfirmModal, SettingsSection, ToggleRow, toastError } from "@adelie/ui";
import * as api from "../../api/endpoints";
import { apiErrorText } from "../../lib/api-error";
import { S } from "../../lib/strings";
import { toneInk } from "../../lib/tone";

/** Turns the switch off on the server. Reached only through the confirm. */
const switchOffAgentApiServer = (): Promise<ServerSettingsResponse> =>
  api.adminPutSettings({ agentApiEnabled: false });

/**
 * The question before the switch goes off: the danger tone and what follows. Answered yes, it
 * says the write began, writes the switch off, and hands the outcome on: the stored value, or
 * the failure. The card stays until that outcome arrives — a refusal is drawn inside it.
 */
export function AgentApiServerOffConfirm({
  open,
  onClose,
  onWriting,
  onSettled,
  busy,
  refusal,
}: {
  open: boolean;
  onClose: () => void;
  onWriting: () => void;
  onSettled: (outcome: { enabled: boolean } | { error: unknown }) => void;
  busy: boolean;
  refusal?: string;
}) {
  return (
    <ConfirmModal
      open={open}
      title={S.settings.agentApiOffTitle}
      onClose={onClose}
      busy={busy}
      {...(refusal !== undefined ? { refusal } : {})}
      onConfirm={() => {
        onWriting();
        switchOffAgentApiServer().then(
          (res) => onSettled({ enabled: res.settings.agentApiEnabled }),
          (error: unknown) => onSettled({ error }),
        );
      }}
      confirmLabel={S.settings.agentApiOff}
      cancelLabel={S.common.cancel}
    >
      <p className="text-sm text-fg-muted">{S.settings.agentApiOffConfirm}</p>
    </ConfirmModal>
  );
}

export function AgentApiSection() {
  /** The last value the server confirmed; null until the settings load. */
  const [stored, setStored] = useState<boolean | null>(null);
  /** What the switch shows: the stored value, or the pending one while a write is in flight. */
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [confirmOff, setConfirmOff] = useState(false);
  /** The reason the last off-write was refused; drawn inside the card that asked, not under it. */
  const [offRefusal, setOffRefusal] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .adminGetSettings()
      .then((res) => {
        if (cancelled) return;
        setStored(res.settings.agentApiEnabled);
        setEnabled(res.settings.agentApiEnabled);
      })
      .catch((e: unknown) => {
        if (!cancelled) toastError(apiErrorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Where a write landed: the stored value, or back to the last one with the reason. */
  const settle = (outcome: { enabled: boolean } | { error: unknown }, previous: boolean) => {
    if ("enabled" in outcome) {
      setStored(outcome.enabled);
      setEnabled(outcome.enabled);
    } else {
      setEnabled(previous);
      setError(apiErrorText(outcome.error));
    }
    setBusy(false);
  };

  /**
   * Where the off-write landed: the card closes only on the landing (off), and a refusal keeps it
   * open with the server's words inside it — the switch goes back to the stored value meanwhile,
   * which is what the server still holds.
   */
  const settleOff = (outcome: { enabled: boolean } | { error: unknown }, previous: boolean) => {
    setBusy(false);
    if ("enabled" in outcome) {
      setStored(outcome.enabled);
      setEnabled(outcome.enabled);
      setConfirmOff(false);
    } else {
      setEnabled(previous);
      setOffRefusal(apiErrorText(outcome.error));
    }
  };

  const turnOn = () => {
    if (stored === null || busy) return;
    setEnabled(true);
    setError(undefined);
    setBusy(true);
    api.adminPutSettings({ agentApiEnabled: true }).then(
      (res) => settle({ enabled: res.settings.agentApiEnabled }, stored),
      (err: unknown) => settle({ error: err }, stored),
    );
  };

  return (
    <SettingsSection>
      <div>
        <ToggleRow
          label={S.settings.agentApiToggle}
          checked={enabled}
          onChange={(next) => {
            if (next) turnOn();
            else {
              // Open first, then drop the previous reason: that sentence belonged to the attempt
              // it named, not to the question about to be asked.
              setConfirmOff(true);
              setOffRefusal(null);
            }
          }}
          disabled={stored === null || busy}
        />
        {error !== undefined && <p className={`mt-2 text-xs ${toneInk.danger}`}>{error}</p>}
      </div>
      <AgentApiServerOffConfirm
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        onWriting={() => {
          setEnabled(false);
          setError(undefined);
          setBusy(true);
        }}
        onSettled={(outcome) => settleOff(outcome, stored ?? true)}
        busy={busy}
        {...(offRefusal !== null ? { refusal: S.common.refused(offRefusal) } : {})}
      />
    </SettingsSection>
  );
}
