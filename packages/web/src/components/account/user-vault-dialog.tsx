/**
 * The user-level vault dialog, opened from the account menu (bottom-left avatar) — the
 * signed-in account's OWN secrets (`<root>/users/<userId>/.vault.toml`), one scope above the
 * per-Agent vault on the Agent settings page.
 *
 * Same shape as the Agent vault tab's table (key, masked value, delete + Add), plus the one
 * thing this table has and that one does not: a whole JSON object can be pasted in at once.
 * Every write is whole-table replace through PUT except the import, which merges — the same
 * semantics the server has, so the dialog never has to explain a second set of rules: an Add
 * keeps the other rows (they are resent by key name, values never come back to the browser), a
 * Delete drops one row, an Import merges the pasted object.
 *
 * Mounted outside the menu that opens it (the panel's children unmount when the menu closes);
 * the account menu's own row closes the menu as it opens this.
 */
import { useCallback, useEffect, useState } from "react";
import type { VaultEntryInfo, VaultUpdateRequest } from "@lmliheng/penguin-server/api";
import {
  Button,
  ConfirmModal,
  Input,
  Modal,
  NoticeStrip,
  PasswordInput,
  SettingsEmpty,
  SkeletonList,
  Textarea,
  toastError,
  toastSuccess,
} from "@lmliheng/penguin-ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";

/** Vault key naming rule (consistent with core/server): shell environment variable name. */
const VAULT_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function UserVaultDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<VaultEntryInfo[] | null>(null);
  // Dialog-level error is only the initial load failure; saves/deletes report via toast, and a
  // failed form submission lands on the form that produced it.
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [addErrors, setAddErrors] = useState<{ key?: string; value?: string }>({});
  const [importError, setImportError] = useState<string | null>(null);
  /** Key pending deletion / overwrite confirmation (non-null shows the confirm modal). */
  const [deleting, setDeleting] = useState<string | null>(null);
  const [overwriting, setOverwriting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setEntries(null);
    setError(null);
    try {
      setEntries((await api.getUserVault()).entries);
    } catch (e) {
      setError(apiErrorText(e));
    }
  }, []);

  // Reloaded on every open: this table can also be changed from another tab, and the dialog is
  // cheap to fill (one request) compared with showing a stale key list.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  /** Persist a change immediately (add / delete): returns an error message, or null on success. */
  const persist = async (body: VaultUpdateRequest): Promise<string | null> => {
    setBusy(true);
    try {
      const res = await api.putUserVault(body);
      setEntries(res.entries);
      toastSuccess(S.common.saved);
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
    const err = await persist({ entries: [...keepEntries(key), { key, value: valueInput }] });
    if (err !== null) {
      setAddErrors({ key: err });
      return;
    }
    setAdding(false);
  };

  const confirmRemove = async () => {
    if (deleting === null) return;
    const err = await persist({ entries: keepEntries(deleting) });
    if (err !== null) toastError(err);
    setDeleting(null);
  };

  const importJson = async () => {
    if (!jsonInput.trim()) {
      setImportError(S.common.requiredField);
      return;
    }
    setImportError(null);
    setBusy(true);
    try {
      const res = await api.importUserVault({ json: jsonInput });
      setEntries(res.entries);
      toastSuccess(S.common.saved);
      setImporting(false);
    } catch (e) {
      // The server names the entry that failed (and writes nothing): show it in the dialog
      // rather than as a toast, since the text to fix is right above it.
      setImportError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        title={S.account.userVault.title}
        onClose={onClose}
        widthClass="sm:max-w-2xl"
        footer={
          <Button size="sm" onClick={onClose}>
            {S.common.close}
          </Button>
        }
      >
        <div className="space-y-4">
          {/* What this table is, and the one thing a reader has to know to get anything out of
              it: it reaches no agent by itself. */}
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {S.account.userVault.desc}
          </p>

          {entries === null ? (
            <SkeletonList rows={3} />
          ) : entries.length === 0 ? (
            <SettingsEmpty>{S.account.userVault.empty}</SettingsEmpty>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setDeleting(entry.key)}
                        >
                          {S.account.userVault.remove}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {entries !== null && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="primary" disabled={busy} onClick={openAdd}>
                {S.account.userVault.add}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  setJsonInput("");
                  setImportError(null);
                  setImporting(true);
                }}
              >
                {S.account.userVault.import}
              </Button>
            </div>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </Modal>

      {/* Add: one key + value at a time. A value typed here never leaves the vault — unlike the
          agent tab there is no AI path, because these secrets are not an agent's to ask about. */}
      <Modal
        open={adding}
        title={S.account.userVault.addTitle}
        onClose={() => setAdding(false)}
        footer={
          <>
            <Button size="sm" onClick={() => setAdding(false)}>
              {S.common.cancel}
            </Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void addEntry()}>
              {S.account.userVault.add}
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
              if (addErrors.key || addErrors.value) setAddErrors({});
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
              if (addErrors.key || addErrors.value) setAddErrors({});
            }}
            className="font-mono"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) void addEntry();
            }}
          />
        </div>
      </Modal>

      {/* Import: the whole pasted object, merged by the server (which is what names the entry
          that fails). A plain textarea and not a field: the paste is JSON with its own layout,
          and no browser control here has a JSON mode. */}
      <Modal
        open={importing}
        title={S.account.userVault.importTitle}
        onClose={() => setImporting(false)}
        footer={
          <>
            <Button size="sm" onClick={() => setImporting(false)}>
              {S.common.cancel}
            </Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void importJson()}>
              {S.account.userVault.importSubmit}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {S.account.userVault.importHint}
          </p>
          {/* A plain multi-line field rather than a styled textarea: the paste is JSON with its
              own layout, and the mono rung is what the rest of this dialog's key/value text uses. */}
          <Textarea
            label={S.account.userVault.jsonLabel}
            rows={8}
            size="sm"
            mono
            spellCheck={false}
            autoComplete="off"
            invalid={importError !== null}
            value={jsonInput}
            onChange={(e) => {
              setJsonInput(e.target.value);
              setImportError(null);
            }}
            placeholder={S.account.userVault.importPlaceholder}
          />
          {importError && (
            <NoticeStrip tone="attention" className="rounded-md border px-2.5 py-1.5">
              {importError}
            </NoticeStrip>
          )}
        </div>
      </Modal>

      {/* Overwrite confirmation: the add modal stays underneath, so cancel returns to the form. */}
      <ConfirmModal
        open={overwriting !== null}
        title={S.account.userVault.overwriteTitle}
        tone="primary"
        confirmLabel={S.common.save}
        cancelLabel={S.common.cancel}
        busy={busy}
        onClose={() => setOverwriting(null)}
        onConfirm={() => void addEntry()}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {overwriting !== null ? S.account.userVault.overwriteConfirm(overwriting) : ""}
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={deleting !== null}
        title={S.account.userVault.deleteTitle}
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmRemove()}
        confirmLabel={S.common.confirm}
        cancelLabel={S.common.cancel}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {deleting !== null ? S.account.userVault.deleteConfirm(deleting) : ""}
        </p>
      </ConfirmModal>
    </>
  );
}
