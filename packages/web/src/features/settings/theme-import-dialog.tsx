/**
 * Importing a theme, from the appearance page: ONE dialog with two sources, because a theme is one
 * small JSON file either way.
 *
 * The plugin library needs two dialogs and two name fields — a plugin archive carries a directory
 * layout, and its name may have to be typed. A theme answers all of that itself: the file says what
 * it is called, and the server writes it under that name (`<id>.json`), so the only question left
 * is where the bytes come from. That is a two-way switch, and everything after it is shared — one
 * body, one confirm button, one overwrite confirmation, one success path — which is what keeps the
 * dialog from being two nearly identical ones. It is also why the note under the picker offers ONE
 * import entry rather than one per source: which way the bytes come is the dialog's question, not a
 * third button on the page.
 *
 * Both flows are the same import twice, as in the plugin dialogs: one carries the file in the
 * request, the other a URL the server fetches, and a 409 `theme_exists` opens the overwrite
 * confirmation whose confirm resends THAT request with `overwrite: true` (so the user never picks
 * the file twice), while any other failure rolls back to a toast. The list is re-read on success,
 * which is how the new theme appears in the picker above.
 *
 * Admin-only by the server's own rule — the themes directory is installation-level, and every
 * browser that signs in on this machine is painted by it — so the caller (the appearance section)
 * renders the entry only for an admin, and both routes answer 403 `admin_required` regardless.
 */
import { useState } from "react";
import type { ChangeEvent } from "react";
import {
  Button,
  ConfirmModal,
  HiddenFileInput,
  Input,
  Modal,
  Segmented,
  toastError,
  toastSuccess,
} from "@adelie/ui";
import * as api from "../../api/endpoints";
import { ApiError } from "../../api/client";
import { S } from "../../lib/strings";
import { useLocale } from "../../state/locale";
import { localizedText } from "../chat/skill-use";
import { UPLOAD_LABEL_CLASS } from "../agents/skills-tab";
import { themeFileTooLarge, themeImportErrorText } from "./theme-import";

/** Which way the file arrives: picked here, or fetched by the server from an address. */
type Source = "upload" | "download";

/**
 * One import request, in the shape the overwrite retry needs: repeatable exactly as it was sent.
 * Two variants for the plugin dialogs' reason — the uploaded bytes cannot be recovered once the
 * POST is gone, while a download re-fetches from its URL.
 */
type ImportRequest = { source: "upload"; dataBase64: string } | { source: "download"; url: string };

/** A picked file already read into the request body, with the name the user sees. */
interface PickedFile {
  dataBase64: string;
  fileName: string;
}

export function ThemeImportActions({
  onImported,
}: {
  /** Called once an import landed and was toasted: re-read the list, so the new theme is in the picker. */
  onImported: () => Promise<void> | void;
}) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("upload");
  const [busy, setBusy] = useState(false);
  // The picked file is held rather than posted from the picker's own callback: the confirm is what
  // sends it, and closing the dialog drops it (a base64 body held in memory has no second use).
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [url, setUrl] = useState("");
  // The 409 confirmation, the only state the two flows share.
  const [pending, setPending] = useState<ImportRequest | null>(null);

  const close = () => {
    setOpen(false);
    setPicked(null);
  };

  /** Success path, shared by both flows: close, toast, re-read the list. */
  const imported = async (name: string) => {
    setPending(null);
    setOpen(false);
    setPicked(null);
    setUrl("");
    toastSuccess(S.settings.themeImportDone(name));
    await onImported();
  };

  /**
   * A 409 lands in the overwrite confirmation instead of a toast — it is a question, not a failure
   * — and every other refusal (or a missing admin right) rolls back to one.
   */
  const failed = (e: unknown, request: ImportRequest) => {
    if (e instanceof ApiError && e.status === 409 && e.code === "theme_exists") {
      setPending(request);
    } else {
      setPending(null);
      toastError(themeImportErrorText(e));
    }
  };

  const upload = async (dataBase64: string, overwrite: boolean) => {
    setBusy(true);
    try {
      const res = await api.importThemeArchive({ dataBase64, ...(overwrite ? { overwrite } : {}) });
      await imported(localizedText(locale, res.theme.name, res.theme.nameZh));
    } catch (e) {
      failed(e, { source: "upload", dataBase64 });
    } finally {
      setBusy(false);
    }
  };

  const download = async (target: string, overwrite: boolean) => {
    setBusy(true);
    try {
      const res = await api.importThemeFromUrl({
        url: target,
        ...(overwrite ? { overwrite } : {}),
      });
      await imported(localizedText(locale, res.theme.name, res.theme.nameZh));
    } catch (e) {
      failed(e, { source: "download", url: target });
    } finally {
      setBusy(false);
    }
  };

  /** Read the picked file now, post it later: the confirm is what sends it. */
  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the picker's value so picking the SAME file again after a refusal still fires a change
    // event (the Skills tab's import does the same, for the same reason).
    e.target.value = "";
    if (!file) return;
    // Refused before reading: a theme file is small, and reading a large one into a base64 body
    // only to be told so is work nobody asked for.
    if (themeFileTooLarge(file.size)) {
      toastError(S.settings.themeImportTooLarge);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the `data:…;base64,` prefix the FileReader adds.
      setPicked({
        dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1),
        fileName: file.name,
      });
    };
    reader.onerror = () => toastError(S.common.unknownError);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (source === "upload") {
      if (picked !== null) void upload(picked.dataBase64, false);
    } else {
      void download(url.trim(), false);
    }
  };

  const confirmOverwrite = () => {
    if (pending === null) return;
    if (pending.source === "upload") void upload(pending.dataBase64, true);
    else void download(pending.url, true);
  };

  const canSubmit = source === "upload" ? picked !== null : url.trim() !== "";

  return (
    <>
      {/* The entry sits beside "read again": the two are the same read and the same write, so they
          belong to one row of actions on the folder. Bordered rather than a third line of small
          text, because it is the only one of them that brings something in. */}
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {S.settings.themeImport}
      </Button>

      <Modal
        open={open}
        title={S.settings.themeImportTitle}
        onClose={close}
        widthClass="sm:max-w-lg"
        footer={
          <>
            <Button size="sm" onClick={close}>
              {S.common.cancel}
            </Button>
            {/* One confirm for both sources: disabled until the chosen source has something to
                send, and while an import runs. */}
            <Button size="sm" variant="primary" disabled={busy || !canSubmit} onClick={submit}>
              {busy
                ? S.settings.themeImportBusy
                : source === "upload"
                  ? S.settings.themeImportUploadAction
                  : S.settings.themeImportDownloadAction}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Segmented<Source>
            cols={2}
            options={[
              { value: "upload", label: S.settings.themeImportSourceFile },
              { value: "download", label: S.settings.themeImportSourceUrl },
            ]}
            value={source}
            onChange={setSource}
          />
          {source === "upload" ? (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {S.settings.themeImportFileDesc}
              </p>
              <div className="flex items-center gap-2">
                <label
                  className={`${UPLOAD_LABEL_CLASS} ${busy ? "pointer-events-none opacity-60" : ""}`}
                >
                  <HiddenFileInput
                    accept=".json,application/json"
                    disabled={busy}
                    onChange={onPickFile}
                  />
                  {S.settings.themeImportPickFile}
                </label>
                {/* Which file the next confirm will send: without it, picking one shows nothing. */}
                {picked !== null && (
                  <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {S.settings.themeImportPicked(picked.fileName)}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {S.settings.themeImportUrlDesc}
              </p>
              <Input
                size="sm"
                label={S.settings.themeImportUrlLabel}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={S.settings.themeImportUrlPlaceholder}
                autoComplete="off"
                autoFocus
              />
            </>
          )}
        </div>
      </Modal>

      {/* Overwrite confirmation: the dialog that asked stays underneath (Cancel returns to it, file
          and URL both intact), and confirm resends the same request with `overwrite: true`. */}
      {pending !== null && (
        <ConfirmModal
          open
          title={S.settings.themeImportOverwriteTitle}
          tone="primary"
          confirmLabel={S.settings.themeImportOverwriteAction}
          cancelLabel={S.common.cancel}
          busy={busy}
          onClose={() => setPending(null)}
          onConfirm={confirmOverwrite}
        >
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {S.settings.themeImportOverwriteBody}
          </p>
        </ConfirmModal>
      )}
    </>
  );
}
