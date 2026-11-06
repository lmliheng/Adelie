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
 * Saving takes effect on the next recording; there is nothing to restart and nothing to warm up,
 * so there is no warning to carry.
 */
import { useCallback, useEffect, useState } from "react";
import type { AsrConfig } from "@adelie/server/api";
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
  /** Why the last save was refused for another reason, drawn above the Save row. */
  const [saveRefusal, setSaveRefusal] = useState<string | null>(null);
  /** Why the config could not be read, drawn above the controls it left dead. */
  const [loadRefusal, setLoadRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Adopt server-side truth: the baseline and the drafts move together. */
  const adopt = useCallback((next: AsrConfig) => {
    setStored(next);
    setBaseUrl(next.baseUrl);
    setModel(next.model);
    // Never populated: the value is write-only, so the field is for a new key alone.
    setApiKey("");
    setFieldError(null);
    setSaveRefusal(null);
    setLoadRefusal(null);
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

  const save = async () => {
    if (stored === null) return;
    const nextBaseUrl = baseUrl.trim();
    const nextModel = model.trim();
    const nextApiKey = apiKey.trim();
    if (nextBaseUrl === stored.baseUrl && nextModel === stored.model && nextApiKey === "") {
      toastInfo(S.common.noChangesToSave);
      return;
    }
    setBusy(true);
    setFieldError(null);
    setSaveRefusal(null);
    try {
      const res = await api.putAsrConfig({
        baseUrl: nextBaseUrl,
        model: nextModel,
        // Omitted rather than sent empty: the server keeps what is stored for both spellings,
        // but omitting says the intent instead of relying on it.
        ...(nextApiKey !== "" ? { apiKey: nextApiKey } : {}),
      });
      adopt(res.config);
      toastSuccess(S.common.saved);
    } catch (e: unknown) {
      const code = e instanceof ApiError ? e.code : "";
      const text = apiErrorText(e);
      if (code === "invalid_asr_base_url") setFieldError({ field: "baseUrl", text });
      else if (code === "invalid_asr_model") setFieldError({ field: "model", text });
      else if (code === "invalid_asr_api_key") setFieldError({ field: "apiKey", text });
      // Anything else (a lost session, a dead server) wrote nothing, so the form and the
      // sentence agree and Save is the retry.
      else setSaveRefusal(text);
      if (code === "") toastError(text);
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
        onChange={(e) => {
          setBaseUrl(e.target.value);
          if (fieldError !== null) setFieldError(null);
        }}
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
        onChange={(e) => {
          setModel(e.target.value);
          if (fieldError !== null) setFieldError(null);
        }}
      />
      <PasswordInput
        label={S.settings.speechApiKey}
        size="sm"
        autoComplete="off"
        hint={S.settings.speechApiKeyHint}
        value={apiKey}
        disabled={!hydrated}
        {...(fieldError?.field === "apiKey" ? { error: fieldError.text } : {})}
        onChange={(e) => {
          setApiKey(e.target.value);
          if (fieldError !== null) setFieldError(null);
        }}
      />
      {/* Whether a key is stored is the one thing this field cannot show: it is always empty
          above, by design. Without this line a configured server looks unconfigured. */}
      {hydrated && (
        <p className={`text-xs ${stored.hasKey ? "text-fg-muted" : toneInk.danger}`}>
          {stored.hasKey ? S.settings.speechKeyStored : S.settings.speechKeyMissing}
        </p>
      )}
      {saveRefusal !== null && (
        <p
          role="alert"
          data-tooltip={saveRefusal}
          data-tooltip-content="text"
          className={`line-clamp-2 break-words text-xs ${toneInk.danger}`}
        >
          {saveRefusal}
        </p>
      )}
    </SettingsSection>
  );
}
