/**
 * Real-time voice (admin only, server-global). Four fields — the provider's site, the model, the
 * voice and the key — written together by one PUT, so a rejected field writes nothing.
 *
 * The key is write-only, exactly as the speech-input key beside it is: the read carries `hasKey`,
 * never the key, so the field starts empty on every visit and an empty one means "keep what is
 * stored". That is why the field's hint says so and why the stored key's state is drawn under it.
 *
 * Putting the key here rather than in each deployment's environment is what makes a call possible
 * at all: the relay that uses it runs on the server, so the key never reaches a browser, and the
 * pet window — which is one — can offer the call button without ever holding it.
 *
 * Saving takes effect on the next call; there is nothing to restart. "Test connection" opens the
 * same session a call opens, against the fields ON SCREEN rather than the stored ones, and a save
 * follows itself with one so a configuration that cannot connect is never left looking finished.
 */
import { useCallback, useEffect, useState } from "react";
import type { RealtimeConfig, RealtimeTestResponse } from "@adelie/server/api";
import { Button, Input, PasswordInput, SettingsSection, toastInfo, toastSuccess } from "@adelie/ui";
import * as api from "../../api/endpoints";
import { apiErrorText } from "../../lib/api-error";
import { S } from "../../lib/strings";
import { toneInk } from "../../lib/tone";
import { realtimeRefusal } from "./realtime-save-refusal";

type Field = "baseUrl" | "model" | "voice" | "apiKey";

export function RealtimeSection() {
  /** The stored config as hydrated on mount (null until then) — the no-change baseline. */
  const [stored, setStored] = useState<RealtimeConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [voice, setVoice] = useState("");
  const [apiKey, setApiKey] = useState("");
  /** The field a refusal is about, drawn under it. */
  const [fieldError, setFieldError] = useState<{ field: Field; text: string } | null>(null);
  /** Why the last save or check was refused for another reason, drawn above the Save row. */
  const [refusal, setRefusal] = useState<string | null>(null);
  /** Why the config could not be read, drawn above the controls it left dead. */
  const [loadRefusal, setLoadRefusal] = useState<string | null>(null);
  /** The last connectivity check's answer, drawn under the key's state; cleared by an edit. */
  const [check, setCheck] = useState<RealtimeTestResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  /** Adopt server-side truth: the baseline and the drafts move together. */
  const adopt = useCallback((next: RealtimeConfig) => {
    setStored(next);
    setBaseUrl(next.baseUrl);
    setModel(next.model);
    setVoice(next.voice);
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
        const res = await api.getRealtimeConfig();
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
    voice: voice.trim(),
    ...(apiKey.trim() !== "" ? { apiKey: apiKey.trim() } : {}),
  });

  /** A refusal both verbs share: the offending field, or the line above the buttons. */
  const showRefusal = (e: unknown): void => {
    const { slot, text } = realtimeRefusal(e);
    if (slot === "section") setRefusal(text);
    else setFieldError({ field: slot, text });
  };

  /**
   * Ask the service whether it will open a session with what is on screen. `ok: false` comes back
   * as a result rather than as a failure — the check ran, and what it found is the provider's own
   * sentence.
   */
  const runCheck = async () => {
    if (stored === null) return;
    setTesting(true);
    setFieldError(null);
    setRefusal(null);
    setCheck(null);
    try {
      setCheck(await api.testRealtimeConfig(fields()));
    } catch (e: unknown) {
      showRefusal(e);
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
      next.voice === stored.voice &&
      next.apiKey === undefined
    ) {
      toastInfo(S.common.noChangesToSave);
      return;
    }
    setBusy(true);
    setFieldError(null);
    setRefusal(null);
    try {
      const res = await api.putRealtimeConfig(next);
      adopt(res.config);
      toastSuccess(S.common.saved);
      // A saved configuration that cannot connect is the state worth catching here rather than at
      // the first call; the fields have not changed, so this checks what was just stored.
      void runCheck();
    } catch (e: unknown) {
      showRefusal(e);
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
        ? S.settings.realtimeTestOk(check.endpoint)
        : S.settings.realtimeTestFailed(check.endpoint) + check.message;
  return (
    <SettingsSection
      actions={
        <>
          <Button
            size="sm"
            variant="secondary"
            disabled={!hydrated || busy || testing}
            loading={testing}
            loadingLabel={S.settings.realtimeTestRunning}
            onClick={() => void runCheck()}
          >
            {S.settings.realtimeTest}
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
        label={S.settings.realtimeBaseUrl}
        required
        size="sm"
        type="url"
        inputMode="url"
        placeholder="https://dashscope.aliyuncs.com"
        hint={S.settings.realtimeBaseUrlHint}
        value={baseUrl}
        disabled={!hydrated}
        {...(fieldError?.field === "baseUrl" ? { error: fieldError.text } : {})}
        onChange={(e) => edited(() => setBaseUrl(e.target.value))}
      />
      <Input
        label={S.settings.realtimeModel}
        required
        size="sm"
        placeholder="qwen3.8-omni-flash-realtime"
        hint={S.settings.realtimeModelHint}
        value={model}
        disabled={!hydrated}
        {...(fieldError?.field === "model" ? { error: fieldError.text } : {})}
        onChange={(e) => edited(() => setModel(e.target.value))}
      />
      <Input
        label={S.settings.realtimeVoice}
        required
        size="sm"
        placeholder="Tina"
        hint={S.settings.realtimeVoiceHint}
        value={voice}
        disabled={!hydrated}
        {...(fieldError?.field === "voice" ? { error: fieldError.text } : {})}
        onChange={(e) => edited(() => setVoice(e.target.value))}
      />
      <PasswordInput
        label={S.settings.realtimeApiKey}
        size="sm"
        autoComplete="off"
        hint={S.settings.realtimeApiKeyHint}
        value={apiKey}
        disabled={!hydrated}
        {...(fieldError?.field === "apiKey" ? { error: fieldError.text } : {})}
        onChange={(e) => edited(() => setApiKey(e.target.value))}
      />
      {/* Whether a key is stored is the one thing this field cannot show: it is always empty
          above, by design. Without this line a configured server looks unconfigured. */}
      {hydrated && (
        <p className={`text-xs ${stored.hasKey ? "text-fg-muted" : toneInk.danger}`}>
          {stored.hasKey ? S.settings.realtimeKeyStored : S.settings.realtimeKeyMissing}
        </p>
      )}
      {/* What the last check found, under the state it is about. The failure carries the
          provider's own sentence — nothing here translates it, because it names what is wrong at
          the provider and that is where it is fixed. */}
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
          data-tooltip={S.common.refused(refusal)}
          data-tooltip-content="text"
          className={`line-clamp-2 break-words text-xs ${toneInk.danger}`}
        >
          {S.common.refused(refusal)}
        </p>
      )}
    </SettingsSection>
  );
}
