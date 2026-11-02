/**
 * Upload limits (admin only, server-global), modelled on the proxy section beside it. Two
 * whole-MB numbers — the per-file attachment cap and the per-message total — written together
 * by a single PUT to /api/admin/settings, so a rejected value writes nothing.
 *
 * The bounds quoted under each field, and the fixed limits the page's "?" names, come from the
 * server (`/api/me` uploadLimits) rather than from constants here: the range is a statement
 * about what the server can survive, and a second copy of it in the browser would be a copy
 * that goes stale. A value outside it is refused by the server with `invalid_attachment_limit`
 * and rendered inline under the field, the same way the proxy section handles a bad address.
 *
 * Both fields stay disabled until the stored numbers arrive, so a read that fails leaves two dead
 * fields showing nothing — which is why the reason is drawn above them rather than in a toast that
 * dismisses itself: the reader has to be told why, and leaving the page and coming back is the
 * retry (`readServerSettings`).
 *
 * Saving takes effect immediately — the attachment validators and the request body cap both
 * read the setting per request — so there is nothing to restart and nothing to warn about.
 */
import { useEffect, useState } from "react";
import { Button, Input, SettingsSection, toastError, toastInfo, toastSuccess } from "@adelie/ui";
import * as api from "../../api/endpoints";
import { ApiError } from "../../api/client";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { toneInk } from "../../lib/tone";
import { useAuth } from "../../state/auth";
import { readServerSettings, settingsReadRefusal } from "./settings-read";

/** The two numbers this page is about, as they are stored. */
interface StoredLimits {
  maxMb: number;
  totalMb: number;
}

const limitsOf = (settings: {
  attachmentMaxMb: number;
  attachmentTotalMb: number;
}): StoredLimits => ({ maxMb: settings.attachmentMaxMb, totalMb: settings.attachmentTotalMb });

export function UploadsSection() {
  const { uploadLimits, refresh } = useAuth();
  /** Stored limits as hydrated on mount (null until then) — the no-change baseline. */
  const [stored, setStored] = useState<StoredLimits | null>(null);
  // Kept as strings: a number input that clears to NaN cannot be typed into (backspacing the
  // last digit would snap the field back to a value the user is in the middle of replacing).
  const [maxMb, setMaxMb] = useState("");
  const [totalMb, setTotalMb] = useState("");
  /**
   * Inline error, and which fields it is about. The local shape check knows the offending field;
   * the server's `invalid_attachment_limit` is a statement about the pair, so it marks both.
   */
  const [limitError, setLimitError] = useState<{
    text: string;
    max: boolean;
    total: boolean;
  } | null>(null);
  /** Why the settings could not be read, drawn above the fields it left dead (null once read). */
  const [loadRefusal, setLoadRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Adopt server-side truth: the baseline and the drafts move together. */
  const adopt = (next: StoredLimits) => {
    setStored(next);
    setMaxMb(String(next.maxMb));
    setTotalMb(String(next.totalMb));
  };

  useEffect(() => {
    let cancelled = false;
    void readServerSettings(limitsOf).then((read) => {
      if (cancelled) return;
      if (read.status === "read") adopt(read.value);
      else setLoadRefusal(settingsReadRefusal(read));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (stored === null || busy) return;
    const parsedMax = Number(maxMb.trim());
    const parsedTotal = Number(totalMb.trim());
    // Shape-check locally so an empty or non-numeric field never becomes a NaN in the request
    // body; the RANGE is left to the server, which owns it (this form only reports its verdict).
    const maxBad = maxMb.trim() === "" || !Number.isInteger(parsedMax);
    const totalBad = totalMb.trim() === "" || !Number.isInteger(parsedTotal);
    if (maxBad || totalBad) {
      setLimitError({
        text: S.errors.byCode.invalid_attachment_limit,
        max: maxBad,
        total: totalBad,
      });
      return;
    }
    if (parsedMax === stored.maxMb && parsedTotal === stored.totalMb) {
      toastInfo(S.common.noChangesToSave);
      return;
    }
    setBusy(true);
    setLimitError(null);
    try {
      const res = await api.adminPutSettings({
        attachmentMaxMb: parsedMax,
        attachmentTotalMb: parsedTotal,
      });
      adopt(limitsOf(res.settings));
      // The composer reads the limits from /api/me, so re-pull them: without this the tab that
      // just raised the cap would keep refusing files at the old number until the next reload.
      await refresh().catch(() => {});
      toastSuccess(S.common.saved);
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_attachment_limit") {
        setLimitError({ text: apiErrorText(e), max: true, total: true });
      } else {
        toastError(apiErrorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const hydrated = stored !== null;
  return (
    <SettingsSection
      actions={
        <Button
          size="sm"
          variant="primary"
          disabled={!hydrated || busy}
          onClick={() => void save()}
        >
          {S.common.save}
        </Button>
      }
    >
      {/* Why the two fields are dead: the read failed, so neither holds a stored number. Drawn
          first, because the fields below it do not represent the server in this state. */}
      {loadRefusal !== null && (
        <p
          role="alert"
          data-tooltip={loadRefusal}
          data-tooltip-content="text"
          className={`line-clamp-2 break-words text-xs ${toneInk.danger}`}
        >
          {loadRefusal}
        </p>
      )}
      <Input
        label={S.settings.attachmentMaxMb}
        required
        size="sm"
        type="number"
        inputMode="numeric"
        min={uploadLimits.attachmentLimitMinMb}
        max={uploadLimits.attachmentLimitMaxMb}
        hint={S.settings.attachmentMaxMbHint(
          uploadLimits.attachmentLimitMinMb,
          uploadLimits.attachmentLimitMaxMb,
        )}
        value={maxMb}
        disabled={!hydrated}
        {...(limitError?.max === true ? { error: limitError.text } : {})}
        onChange={(e) => {
          setMaxMb(e.target.value);
          if (limitError !== null) setLimitError(null);
        }}
      />
      <Input
        label={S.settings.attachmentTotalMb}
        required
        size="sm"
        type="number"
        inputMode="numeric"
        min={uploadLimits.attachmentLimitMinMb}
        max={uploadLimits.attachmentLimitMaxMb}
        hint={S.settings.attachmentTotalMbHint(
          uploadLimits.attachmentLimitMinMb,
          uploadLimits.attachmentLimitMaxMb,
        )}
        value={totalMb}
        disabled={!hydrated}
        {...(limitError?.total === true
          ? // The message renders once, on the first field at fault; a second faulty field is
            // marked without repeating the sentence.
            limitError.max
            ? { invalid: true }
            : { error: limitError.text }
          : {})}
        onChange={(e) => {
          setTotalMb(e.target.value);
          if (limitError !== null) setLimitError(null);
        }}
      />
    </SettingsSection>
  );
}
