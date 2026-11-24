/**
 * Messaging panel — the current conversation's messaging bindings as a dock tab, sitting
 * in the panel rail beside the subagents and Trace panels. It renders the SAME shared
 * channel-aware binding editor as the session-row dialog (hook + body, not a fork): the
 * channel selector switching between the two channels' forms (each independently
 * savable), then the connection controls — the enable/disable toggle (one enabled channel
 * per conversation) with the live status line, both probes, and the hint naming what gates
 * the switch — then the per-channel credential fields with the credential-source link at
 * the field corner and the models-style stored-secret row, and the collapsed FAQ folds
 * below the Save area. There is no unbind action — removing a credential is the secret
 * field's clear checkbox.
 *
 * Status polling is gated on `active` (the dock keeps hidden tabs mounted): a hidden tab
 * neither polls nor loses the form state it accumulated.
 */
import { Button, NoticeStrip, Skeleton } from "@adelie/ui";
import { S } from "../../lib/strings";
import {
  MessagingBindingBody,
  MessagingBindingHelp,
  useMessagingBinding,
} from "./messaging-binding-editor";
import type { DockSurface } from "../dock/panel-context";

export function MessagingPanel({
  sessionId,
  active,
  surface,
}: {
  sessionId: string;
  active: boolean;
  /**
   * The dock surface this body is drawn on. The form the reader typed is handed back when the
   * layout moves the panel to another one — and only then (messaging-form-keep.ts).
   */
  surface?: DockSurface;
}) {
  // `saysLoadRefusal`: this panel keeps a failed read on screen (below), so the hook leaves the
  // toast to the dialog host instead of repeating the sentence in a notification that erases.
  const b = useMessagingBinding(sessionId, {
    poll: active,
    saysLoadRefusal: true,
    ...(surface !== undefined ? { surface } : {}),
  });

  return (
    <div className="h-full overflow-y-auto p-3">
      {b.form === null ? (
        b.loadRefusal !== null ? (
          <div className="space-y-2">
            <NoticeStrip
              tone="danger"
              role="alert"
              className="rounded-md border px-2.5 py-2 text-xs"
            >
              <span data-slot="body">{b.loadRefusal}</span>
            </NoticeStrip>
            {/* The read is what failed, so reading again is the retry — and the panel has no
                other control that could stand in for it while the form has not arrived. */}
            <Button size="sm" onClick={() => b.reload()}>
              {S.common.retry}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        )
      ) : (
        <div className="space-y-3">
          <MessagingBindingBody b={b} />
          {/* The dialog places Save in its footer; the panel keeps it under the form. */}
          <div className="flex items-center justify-end gap-2">
            <Button
              id={b.saveButtonId}
              variant="primary"
              size="sm"
              disabled={b.busy}
              onClick={() => void b.save()}
            >
              {b.busy ? S.common.saving : S.common.save}
            </Button>
          </div>
          {/* Below the save area: the collapsed setup/what/troubleshooting folds. */}
          <MessagingBindingHelp channel={b.form.channel} />
        </div>
      )}
    </div>
  );
}
