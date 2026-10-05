/**
 * Agent settings page "Vault" tab: an Agent-level key-value vault
 * (agent_state/.vault.toml) — a table (key, masked value, delete) plus an "Add" modal
 * (key + value, value uses a password field). Saving goes through PUT with
 * whole-table replace semantics: keys absent from the body are deleted, and
 * resending only the key name means keep the original value (plaintext never comes
 * back to the frontend); only owners can edit, members are read-only.
 * The key name is injected into the Agent's system prompt to inform the model; the
 * value is injected only into the exec_command subprocess environment, never into
 * the model context.
 *
 * "Assign user secrets" copies the account's own global secrets (the user-level vault behind the
 * account menu's User secrets row) into this table, one selected key at a time, and says in its
 * own copy that it is a copy: the Agent keeps the value it was given, so a later change to the
 * global entry has to be assigned again. Nothing here links the two tables — the runtime injects
 * this file and only this file.
 *
 * Prompt-injection controls (usePromptInjection): the vault.enabled switch, the
 * {{VAULT}}-placeholder alert (with legacy-template migration) and the editable
 * vault.prompt section, mirroring the Memory tab — owner-only, like the table edits.
 */
import { useCallback, useEffect, useState } from "react";
import type { VaultEntryInfo, VaultUpdateRequest } from "@lmliheng/penguin-server/api";
import {
  Button,
  Checkbox,
  ConfirmModal,
  HelpFold,
  Input,
  Modal,
  NoticeStrip,
  PasswordInput,
  SettingsEmpty,
  SkeletonList,
  toastError,
  toastSuccess,
} from "@lmliheng/penguin-ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { useProject } from "../../state/project";
import { usePromptInjection } from "./prompt-injection-controls";
import { AiCreateModal } from "../ai-create";
import { AiCreateButtons } from "../ai-create/ai-create-buttons";

/** Vault key naming rule (consistent with core/server): shell environment variable name. */
const VAULT_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function VaultTab({
  agentId,
  onConfigChanged,
}: {
  agentId: string;
  /** Config writes (toggle / prompt / placeholder insert) happen here directly, so the settings page must refetch its own copy — otherwise a later Prompt-tab save from stale data would silently revert them. */
  onConfigChanged?: () => void;
}) {
  const { currentProject, agents, reloadAgents } = useProject();
  const projectId = currentProject?.projectId ?? null;
  const isOwner = currentProject?.role === "owner";
  // Prompt-injection controls follow the tab's existing gate: owner-only edits.
  const { applyConfig, toggleCard, alertStrip, promptSection } = usePromptInjection({
    agentId,
    feature: "vault",
    strings: S.vault.injection,
    canEdit: isOwner,
    onConfigChanged,
  });

  const [entries, setEntries] = useState<VaultEntryInfo[] | null>(null);
  // Tab-level error is only the initial load failure; saves/deletes report via toast.
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Add modal: form state and per-field errors travel with the modal (a tab-level error would be hidden behind it).
  const [adding, setAdding] = useState(false);
  /** "Add with AI" dialog: its prompt goes to the Project's default agent, naming this agent as the target. */
  const [aiAdding, setAiAdding] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [addErrors, setAddErrors] = useState<{ key?: string; value?: string }>({});
  const clearAddErrors = () => setAddErrors((p) => (p.key || p.value ? {} : p));
  // Key pending deletion confirmation (non-null shows the confirm modal).
  const [deleting, setDeleting] = useState<string | null>(null);
  // Existing key pending overwrite confirmation (adding a key that's already configured replaces its value).
  const [overwriting, setOverwriting] = useState<string | null>(null);
  /**
   * Assign-user-secrets dialog: the account's global table (null while loading, and after a
   * failed load) and the key names ticked in it. Read fresh on every open rather than cached —
   * the global table is edited from the account menu, which this tab has no way to hear about.
   */
  const [assigning, setAssigning] = useState(false);
  const [globalEntries, setGlobalEntries] = useState<VaultEntryInfo[] | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async () => {
    if (!projectId || !agentId) return;
    setEntries(null);
    setError(null);
    try {
      // The injection controls' state loads in parallel with the tab's own table.
      const [res, configView] = await Promise.all([
        api.getVault(projectId, agentId),
        api.getAgentConfig(projectId, agentId),
      ]);
      setEntries(res.entries);
      applyConfig(configView.config);
    } catch (e) {
      setError(apiErrorText(e));
    }
  }, [projectId, agentId, applyConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Persist a change immediately (add / delete): returns null on success, an error message on failure — the caller decides whether it lands inside the modal or at the tab level. */
  const persist = async (body: VaultUpdateRequest): Promise<string | null> => {
    if (!projectId || !agentId) return S.common.unknownError;
    setBusy(true);
    try {
      const res = await api.putVault(projectId, agentId, body);
      setEntries(res.entries);
      toastSuccess(S.agent.savedTakesEffect);
      // Add / delete moves the agent card's vault-key count; refresh the list provider too.
      void reloadAgents();
      return null;
    } catch (e) {
      return apiErrorText(e);
    } finally {
      setBusy(false);
    }
  };

  /** Keep existing keys (resending only the key name = keep the original value), excluding excludeKey. */
  const keepEntries = (excludeKey?: string) =>
    (entries ?? [])
      .filter((e) => e.key !== excludeKey)
      .map((e): VaultUpdateRequest["entries"][number] => ({ key: e.key }));

  /** Open the add modal (reset form and error state). */
  const openAdd = () => {
    setKeyInput("");
    setValueInput("");
    setAddErrors({});
    setAdding(true);
  };

  const addEntry = async () => {
    const key = keyInput.trim();
    const next: { key?: string; value?: string } = {};
    if (!key) next.key = S.common.requiredField;
    else if (!VAULT_KEY_PATTERN.test(key)) next.key = S.vault.keyInvalid;
    if (!valueInput) next.value = S.vault.valueRequired;
    if (next.key || next.value) {
      setAddErrors(next);
      return;
    }
    setAddErrors({});
    // Submitting an already-configured key overwrites its value (unrecoverable): confirm first.
    if (overwriting !== key && (entries ?? []).some((e) => e.key === key)) {
      setOverwriting(key);
      return;
    }
    setOverwriting(null);
    // Upsert by same key name: don't resend the existing entry too, to avoid a 400 from PUT's duplicate-key validation.
    const err = await persist({ entries: [...keepEntries(key), { key, value: valueInput }] });
    if (err !== null) {
      // Server rejection (e.g. duplicate key) — surface it on the key field.
      setAddErrors({ key: err });
      return;
    }
    setAdding(false);
  };

  /** Confirm modal's "Confirm": closes the modal after deletion; a failure pops a toast. */
  const confirmRemove = async () => {
    if (deleting === null) return;
    const err = await persist({ entries: keepEntries(deleting) });
    if (err !== null) toastError(err);
    setDeleting(null);
  };

  /** Open the assign dialog: an empty selection and a fresh read of the account's global table. */
  const openAssign = async () => {
    setAssigning(true);
    setGlobalEntries(null);
    setGlobalError(null);
    setSelected(new Set());
    try {
      setGlobalEntries((await api.getUserVault()).entries);
    } catch (e) {
      setGlobalError(apiErrorText(e));
    }
  };

  const toggleSelected = (key: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  /**
   * Assign the ticked global secrets to this Agent: a copy into its own vault, so the response is
   * this tab's refreshed table. The global table is untouched and no later edit to it follows —
   * see the dialog's own note.
   */
  const confirmAssign = async () => {
    if (!projectId || !agentId || selected.size === 0) return;
    setBusy(true);
    try {
      const res = await api.assignUserVaultToAgent(projectId, agentId, { keys: [...selected] });
      setEntries(res.entries);
      toastSuccess(S.vault.assign.done(selected.size));
      void reloadAgents();
      setAssigning(false);
    } catch (e) {
      setGlobalError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) return null;

  return (
    <div className="space-y-4">
      {/* What the vault is and when a value takes effect is read once and then in the way; the
          table below is what the tab is for. The panel repeats no title — the tab bar carries it —
          so the disclosure names itself instead of hanging a "?" off nothing. */}
      <HelpFold label={S.agent.tabVault}>
        {S.vault.desc}
        {!isOwner && <span className="mt-1.5 block">{S.vault.readOnlyHint}</span>}
      </HelpFold>

      {toggleCard}
      {alertStrip}

      {entries === null ? (
        <SkeletonList rows={4} />
      ) : entries.length === 0 ? (
        <SettingsEmpty>{S.vault.empty}</SettingsEmpty>
      ) : (
        <div className="overflow-x-auto overflow-y-clip rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900">
                <th className="px-3 py-2.5">{S.vault.key}</th>
                <th className="px-3 py-2.5">{S.vault.valueMasked}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.key}
                  className="border-b border-gray-100 transition-colors duration-150 last:border-b-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/40"
                >
                  <td className="px-3 py-2 font-mono text-xs">{entry.key}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {entry.valueMasked}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isOwner && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setDeleting(entry.key)}
                      >
                        {S.vault.remove}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add entry points (owner): two separate buttons. The manual one opens the form in a modal
          (submitting the same key name overwrites the original value), the AI one the prompt. */}
      {isOwner && entries !== null && (
        <AiCreateButtons
          size="sm"
          disabled={busy}
          onAi={() => setAiAdding(true)}
          onManual={openAdd}
        />
      )}

      {/* Assigning the account's own global secrets. Its own line under the add buttons, with the
          one sentence that decides whether a user trusts it: what it does is copy. */}
      {isOwner && entries !== null && (
        <div className="space-y-1.5">
          <Button size="sm" disabled={busy} onClick={() => void openAssign()}>
            {S.vault.assign.open}
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400">{S.vault.assign.hint}</p>
        </div>
      )}

      {promptSection}

      <Modal
        open={adding}
        title={S.vault.addTitle}
        onClose={() => setAdding(false)}
        footer={
          <>
            <Button size="sm" onClick={() => setAdding(false)}>
              {S.common.cancel}
            </Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void addEntry()}>
              {S.vault.add}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            size="sm"
            label={S.vault.key}
            required
            hint={S.vault.keyHint}
            error={addErrors.key}
            value={keyInput}
            onChange={(e) => {
              setKeyInput(e.target.value);
              clearAddErrors();
            }}
            className="font-mono"
            placeholder="OPENAI_API_KEY"
            autoComplete="off"
          />
          <PasswordInput
            size="sm"
            label={S.vault.value}
            required
            error={addErrors.value}
            value={valueInput}
            onChange={(e) => {
              setValueInput(e.target.value);
              clearAddErrors();
            }}
            className="font-mono"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) void addEntry();
            }}
          />
        </div>
      </Modal>

      {/* Assign user secrets: the account's global table, ticked per key. Read-only here — this
          dialog copies, it does not edit the source (that is the account menu's dialog). Every
          global key is offered, including one this Agent already has: a same-named key replaces
          this table's value, which is the whole point of assigning again after a rotation. */}
      <Modal
        open={assigning}
        title={S.vault.assign.title}
        onClose={() => setAssigning(false)}
        widthClass="sm:max-w-lg"
        footer={
          <>
            <Button size="sm" onClick={() => setAssigning(false)}>
              {S.common.cancel}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || selected.size === 0}
              onClick={() => void confirmAssign()}
            >
              {S.vault.assign.confirm}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {S.vault.assign.overwritten}
          </p>
          {globalError !== null ? (
            <p className="text-xs text-red-600 dark:text-red-400">{globalError}</p>
          ) : globalEntries === null ? (
            <SkeletonList rows={3} />
          ) : globalEntries.length === 0 ? (
            <SettingsEmpty>{S.vault.assign.empty}</SettingsEmpty>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {S.vault.assign.selected(selected.size)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    setSelected(
                      selected.size === globalEntries.length
                        ? new Set()
                        : new Set(globalEntries.map((e) => e.key)),
                    )
                  }
                >
                  {S.vault.assign.all}
                </Button>
              </div>
              <div className="overflow-y-auto rounded-md border border-gray-200 dark:border-gray-800">
                {globalEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0 dark:border-gray-800/60"
                  >
                    <Checkbox
                      checked={selected.has(entry.key)}
                      onChange={(on) => toggleSelected(entry.key, on)}
                      label={<span className="font-mono text-xs">{entry.key}</span>}
                    />
                    <span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {entry.valueMasked}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* The AI path. Its lead is an honest warning: a value typed into the prompt is recorded in
          the conversation's Trace, whereas a value typed into the form never leaves the vault. The
          dialog's one exit already agrees with that warning — the prompt lands in a composer and is
          read once more before anything carries it to a provider. */}
      <AiCreateModal
        open={aiAdding}
        onClose={() => setAiAdding(false)}
        title={S.vault.aiAddTitle}
        intro={
          <NoticeStrip tone="attention" className="rounded-md border px-2.5 py-1.5">
            {S.vault.aiAddIntro}
          </NoticeStrip>
        }
        placeholder={S.vault.aiAddPlaceholder}
        examples={S.vault.aiAddExamples}
        tail={S.vault.aiAddTail(agentId, projectId)}
        agents={agents}
      />

      {/* Overwrite confirmation: the add modal stays underneath, so cancel returns to the form. */}
      <ConfirmModal
        open={overwriting !== null}
        title={S.vault.overwriteTitle}
        tone="primary"
        confirmLabel={S.common.save}
        cancelLabel={S.common.cancel}
        busy={busy}
        onClose={() => setOverwriting(null)}
        onConfirm={() => void addEntry()}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {overwriting !== null ? S.vault.overwriteConfirm(overwriting) : ""}
        </p>
      </ConfirmModal>

      {/* Delete confirmation (shared ConfirmModal, same pattern as Agent / Session deletion). */}
      <ConfirmModal
        open={deleting !== null}
        title={S.vault.deleteTitle}
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmRemove()}
        confirmLabel={S.common.confirm}
        cancelLabel={S.common.cancel}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {deleting !== null ? S.vault.deleteConfirm(deleting) : ""}
        </p>
      </ConfirmModal>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
