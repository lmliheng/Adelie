/**
 * Speech input (admin only, server-global). Three fields — the provider's site, the model id
 * and the key — written together by one PUT, so a rejected field writes nothing.
 *
 * The key is write-only: the read carries `hasKey`, never the key, so the field starts empty on
 * every visit and an empty one means "keep what is stored". That is why the field's hint says so
 * and why the stored key's state is drawn under it: without both, a page that shows an empty key
 * box over a configured server looks like the key was lost.
 *
 * The read hydrates on mount, and the controls and Save stay disabled until it lands — a failed
 * read leaves the fields showing nothing, so the reason is drawn above them rather than in a
 * toast that dismisses itself, and leaving the section and coming back is the retry (7.19's rule,
 * the one every settings page here follows).
 *
 * Saving takes effect on the next recording; there is nothing to restart and nothing to warm up.
 * What a save cannot tell the operator is whether the site, the model and the key are any good,
 * and the microphone is a slow way to find out — so "Test connection" runs the same task a
 * recording runs, over silence, against the fields ON SCREEN rather than the stored ones (saving
 * a key just to learn whether it works is the wrong order), and a save follows itself with one so
 * a configuration that cannot connect is never left looking finished.
 */
import { useCallback, useEffect, useState } from "react";
import type { AsrConfig, AsrTestResponse } from "@adelie/server/api";
import {
  Button,
  Input,
  PasswordInput,
  SettingsSection,
  toastError,
  toastInfo,
  toastSuccess,
} from "@adelie/ui";
import * as api from "../../api/endpoints";
import { ApiError } from "../../api/client";
import { apiErrorText } from "../../lib/api-error";
import { S } from "../../lib/strings";
import { toneInk } from "../../lib/tone";

export function AsrSection() {
  /** The stored config as hydrated on mount (null until then) — the no-change baseline. */
  const [stored, setStored] = useState<AsrConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  /** The field a refusal is about, drawn under it. */
  const [fieldError, setFieldError] = useState<{
    field: "baseUrl" | "model" | "apiKey";
    text: string;
  } | null>(null);
  /** Why the last save or check was refused for another reason, drawn above the Save row. */
  const [refusal, setRefusal] = useState<string | null>(null);
  /** Why the config could not be read, drawn above the controls it left dead. */
  const [loadRefusal, setLoadRefusal] = useState<string | null>(null);
  /** The last connectivity check's answer, drawn under the key's state; cleared by an edit. */
  const [check, setCheck] = useState<AsrTestResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  /** Adopt server-side truth: the baseline and the drafts move together. */
  const adopt = useCallback((next: AsrConfig) => {
    setStored(next);
    setBaseUrl(next.baseUrl);
    setModel(next.model);
    // Never populated: the value is write-only, so the field is for a new key alone.
    setApiKey("");
    setFieldError(null);
    setRefusal(null);
    setLoadRefusal(null);
    setCheck(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.getAsrConfig();
        if (!cancelled) adopt(res.config);
      } catch (e: unknown) {
        if (!cancelled) setLoadRefusal(apiErrorText(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  /** The fields as one body: the typed key only when there is one, an empty box meaning "stored". */
  const fields = () => ({
    baseUrl: baseUrl.trim(),
    model: model.trim(),
    ...(apiKey.trim() !== "" ? { apiKey: apiKey.trim() } : {}),
  });

  /** A refusal both verbs share: the offending field, or the line above the buttons. */
  const showRefusal = (e: unknown): void => {
    const code = e instanceof ApiError ? e.code : "";
    const text = apiErrorText(e);
    // Anything else (a lost session, a dead server) wrote nothing, so the form and the sentence
    // agree and the button is the retry.
    if (code === "invalid_asr_base_url") setFieldError({ field: "baseUrl", text });
    else if (code === "invalid_asr_model") setFieldError({ field: "model", text });
    else if (code === "invalid_asr_api_key") setFieldError({ field: "apiKey", text });
    else setRefusal(text);
  };

  /**
   * Ask the service whether it will take what is on screen. `ok: false` comes back as a result
   * rather than as a failure — the check ran, and what it found is the provider's own sentence.
   */
  const runCheck = async () => {
    if (stored === null) return;
    setTesting(true);
    setFieldError(null);
    setRefusal(null);
    setCheck(null);
    try {
      setCheck(await api.testAsrConfig(fields()));
    } catch (e: unknown) {
      showRefusal(e);
      if (!(e instanceof ApiError)) toastError(apiErrorText(e));
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (stored === null) return;
    const next = fields();
    if (
      next.baseUrl === stored.baseUrl &&
      next.model === stored.model &&
      next.apiKey === undefined
    ) {
      toastInfo(S.common.noChangesToSave);
      return;
    }
    setBusy(true);
    setFieldError(null);
    setRefusal(null);
    try {
      const res = await api.putAsrConfig({
        baseUrl: next.baseUrl,
        model: next.model,
        // Omitted rather than sent empty: the server keeps what is stored for both spellings,
        // but omitting says the intent instead of relying on it.
        ...(next.apiKey !== undefined ? { apiKey: next.apiKey } : {}),
      });
      adopt(res.config);
      toastSuccess(S.common.saved);
      // A saved configuration that cannot connect is the state worth catching here rather than
      // at the first recording; the fields have not changed, so this checks what was just stored.
      void runCheck();
    } catch (e: unknown) {
      showRefusal(e);
      if (!(e instanceof ApiError)) toastError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  /** The edit this field invalidates: its own error, and any verdict on the fields as a whole. */
  const edited = (clear: () => void) => {
    clear();
    if (fieldError !== null) setFieldError(null);
    if (check !== null) setCheck(null);
  };

  const hydrated = stored !== null;
  const checkText =
    check === null
      ? ""
      : check.ok
        ? S.settings.speechTestOk(check.endpoint)
        : S.settings.speechTestFailed(check.endpoint) + check.message;
  return (
    <SettingsSection
      actions={
        <>
          <Button
            size="sm"
            variant="secondary"
            disabled={!hydrated || busy || testing}
            loading={testing}
            loadingLabel={S.settings.speechTestRunning}
            onClick={() => void runCheck()}
          >
            {S.settings.speechTest}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!hydrated || busy || testing}
            onClick={() => void save()}
          >
            {S.common.save}
          </Button>
        </>
      }
    >
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
        label={S.settings.speechBaseUrl}
        required
        size="sm"
        type="url"
        inputMode="url"
        placeholder="https://tokendance.space"
        hint={S.settings.speechBaseUrlHint}
        value={baseUrl}
        disabled={!hydrated}
        {...(fieldError?.field === "baseUrl" ? { error: fieldError.text } : {})}
        onChange={(e) => edited(() => setBaseUrl(e.target.value))}
      />
      <Input
        label={S.settings.speechModel}
        required
        size="sm"
        placeholder="qwen-audio-3.1-asr-flash-streaming"
        hint={S.settings.speechModelHint}
        value={model}
        disabled={!hydrated}
        {...(fieldError?.field === "model" ? { error: fieldError.text } : {})}
        onChange={(e) => edited(() => setModel(e.target.value))}
      />
      <PasswordInput
        label={S.settings.speechApiKey}
        size="sm"
        autoComplete="off"
        hint={S.settings.speechApiKeyHint}
        value={apiKey}
        disabled={!hydrated}
        {...(fieldError?.field === "apiKey" ? { error: fieldError.text } : {})}
        onChange={(e) => edited(() => setApiKey(e.target.value))}
      />
      {/* Whether a key is stored is the one thing this field cannot show: it is always empty
          above, by design. Without this line a configured server looks unconfigured. */}
      {hydrated && (
        <p className={`text-xs ${stored.hasKey ? "text-fg-muted" : toneInk.danger}`}>
          {stored.hasKey ? S.settings.speechKeyStored : S.settings.speechKeyMissing}
        </p>
      )}
      {/* What the last check found, under the state it is about. The failure carries the
          provider's own sentence — nothing here translates it, because it names what is wrong
          at the provider (a key, a model, an account in arrears) and that is where it is fixed. */}
      {check !== null && (
        <p
          {...(check.ok ? {} : { role: "alert" })}
          data-tooltip={checkText}
          data-tooltip-content="text"
          className={`line-clamp-2 break-words text-xs ${
            check.ok ? "text-fg-muted" : toneInk.danger
          }`}
        >
          {checkText}
        </p>
      )}
      {refusal !== null && (
        <p
          role="alert"
          data-tooltip={refusal}
          data-tooltip-content="text"
          className={`line-clamp-2 break-words text-xs ${toneInk.danger}`}
        >
          {refusal}
        </p>
      )}
    </SettingsSection>
  );
}
