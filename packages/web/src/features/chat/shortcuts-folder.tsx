/**
 * The folder under the new-chat input card: the shortcuts the user saved themselves.
 *
 * A click FILLS the composer and sends nothing — the composer keeps the text until the user
 * sends it. Three things about it are its own rather than a built-in folder's:
 *
 * - **Its rows are server state**, per user (`ui_prefs.draftShortcuts`), fetched on mount and
 *   written back on every change. Optimistic: the list updates first and rolls back with a toast
 *   if the write fails, because the value being written is already on screen.
 * - **Its length is the user's**, bounded to SHORTCUT_MAX_COUNT. There is no scroll area and no
 *   pinned height: past the cap the New-shortcut row is what the editor refuses, so the folder
 *   cannot grow into a list that needs scrolling.
 * - **Its rows carry their own actions.** Edit and delete are plain icon buttons that are always
 *   visible, deliberately not the sidebar's hover-revealed pair: those rows have a long-press menu
 *   behind them on touch, and these have nothing, so hover-gating would put a user's own prompts
 *   out of reach on a phone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  ConfirmModal,
  GlyphIcon,
  ICONS,
  ICON_SIZE,
  Input,
  Modal,
  PlusIcon,
  Textarea,
  toastError,
} from "@lmliheng/penguin-ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { FolderRow, folderRowClass } from "./folder-row";
import {
  SHORTCUT_MAX_COUNT,
  SHORTCUT_PROMPT_MAX,
  SHORTCUT_TITLE_MAX,
  canAddShortcut,
  defaultShortcutTitle,
  normalizeShortcuts,
  removeShortcut,
  shortcutDraftError,
  upsertShortcut,
} from "./user-shortcuts";
import type { ShortcutDraft, UserShortcut } from "./user-shortcuts";

/**
 * Lightning bolt (lucide zap): the folder's mark. A bookmark glyph would name the mechanism —
 * the rows inside are what get clicked to fill the composer — rather than what this folder
 * holds, and the header's own chevron already says open or shut.
 */
const SHORTCUTS_GLYPH =
  "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z";

/** An always-visible row action (edit / delete), sized and coloured to recede until pointed at. */
function RowAction({
  label,
  glyph,
  danger = false,
  onClick,
}: {
  label: string;
  glyph: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-tooltip={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-150 dark:text-gray-500 ${
        danger
          ? "hover:text-red-600 dark:hover:text-red-400"
          : "hover:text-gray-700 dark:hover:text-gray-200"
      }`}
    >
      <GlyphIcon d={glyph} size={ICON_SIZE.rowLead} />
    </button>
  );
}

export function ShortcutsFolder({
  open,
  onToggle,
  readComposerText,
  onFill,
}: {
  open: boolean;
  /** Flip the folder open or shut; the header row carries the chevron that shows which it is. */
  onToggle: () => void;
  /** The composer's current text, read at click time — a new shortcut starts from what was typed. */
  readComposerText: () => string;
  /** Hand the saved prompt to the composer. Pins no Skills; see user-shortcuts.ts. */
  onFill: (prompt: string) => void;
}) {
  const [shortcuts, setShortcuts] = useState<UserShortcut[]>([]);
  /** Until the stored list has arrived the body stays blank: the empty state must not flash first. */
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<ShortcutDraft | null>(null);
  const [deleting, setDeleting] = useState<UserShortcut | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .getPrefs()
      .then((res) => {
        if (!cancelled) setShortcuts(normalizeShortcuts(res.prefs.draftShortcuts));
      })
      .catch(() => undefined) // Unreachable prefs read as "none saved"; the draft page still works.
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Latest list for the rollback value: a stale closure would restore a list two edits old. */
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const persist = useCallback((next: UserShortcut[]) => {
    const rollback = shortcutsRef.current;
    setShortcuts(next);
    api.putPrefs({ draftShortcuts: next }).catch((e: unknown) => {
      setShortcuts(rollback);
      toastError(apiErrorText(e));
    });
  }, []);

  const startCreate = () => {
    // The high-value path: whatever is already in the composer becomes the body of the new
    // shortcut, with its first line suggested as the name. Both fields stay editable.
    const text = readComposerText().trim();
    setDraft({ id: null, title: defaultShortcutTitle(text), prompt: text });
  };

  const saveDraft = () => {
    if (draft === null || shortcutDraftError(draft) !== null) return;
    persist(upsertShortcut(shortcuts, draft));
    setDraft(null);
  };

  const draftError = draft === null ? null : shortcutDraftError(draft);
  const editing = draft !== null && draft.id !== null;

  return (
    <div>
      <FolderRow
        open={open}
        glyph={SHORTCUTS_GLYPH}
        label={S.chat.shortcuts.folder}
        count={`${shortcuts.length}/${SHORTCUT_MAX_COUNT}`}
        onToggle={onToggle}
      />

      {open && (
        /* No fixed height and no scroll: SHORTCUT_MAX_COUNT bounds the folder, so it cannot grow
           into a list that needs one. */
        <div className="mt-0.5 pl-4">
          {loaded && (
            <ul className="space-y-1">
              {shortcuts.map((shortcut) => (
                <li key={shortcut.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    data-tooltip={`${shortcut.title}\n${S.chat.shortcutFillHint}`}
                    onClick={() => onFill(shortcut.prompt)}
                    className={`flex min-w-0 flex-1 items-center gap-2 ${folderRowClass}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{shortcut.title}</span>
                  </button>
                  <RowAction
                    label={S.common.edit}
                    glyph={ICONS.pencil}
                    onClick={() => setDraft({ ...shortcut })}
                  />
                  <RowAction
                    label={S.common.delete}
                    glyph={ICONS.trash}
                    danger
                    onClick={() => setDeleting(shortcut)}
                  />
                </li>
              ))}
              {/* Gone at the cap rather than disabled: the header already reads 3/3, so a row
                  explaining why it cannot be pressed would say the same thing twice. */}
              {canAddShortcut(shortcuts) && (
                <li>
                  <button
                    type="button"
                    data-tooltip={S.chat.shortcuts.newFromComposer}
                    onClick={startCreate}
                    className={`flex w-full items-center gap-2 ${folderRowClass}`}
                  >
                    <PlusIcon size={ICON_SIZE.inlineGlyph} />
                    <span className="min-w-0 flex-1 truncate">{S.chat.shortcuts.new}</span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Create and edit share one dialog — the fields and the rules are identical, and only the
          dialog's name says which one is happening (the same Modal + Input idiom as the sidebar's
          rename dialogs). */}
      <Modal
        open={draft !== null}
        title={editing ? S.chat.shortcuts.editTitle : S.chat.shortcuts.createTitle}
        onClose={() => setDraft(null)}
        widthClass="sm:max-w-lg"
        footer={
          <>
            <Button size="sm" onClick={() => setDraft(null)}>
              {S.common.cancel}
            </Button>
            <Button size="sm" variant="primary" disabled={draftError !== null} onClick={saveDraft}>
              {S.common.save}
            </Button>
          </>
        }
      >
        {draft !== null && (
          <div className="space-y-3">
            <Input
              size="sm"
              label={S.chat.shortcuts.titleLabel}
              hint={S.chat.shortcuts.titleHint(SHORTCUT_TITLE_MAX)}
              error={
                draftError === "titleTooLong"
                  ? S.chat.shortcuts.titleTooLong(SHORTCUT_TITLE_MAX)
                  : undefined
              }
              value={draft.title}
              autoFocus
              maxLength={SHORTCUT_TITLE_MAX}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onKeyDown={(e) => {
                // isComposing guard (the repo's IME convention): accepting a Chinese candidate
                // fires Enter, which would otherwise save the raw pinyin.
                if (e.key === "Enter" && !e.nativeEvent.isComposing) saveDraft();
              }}
            />
            <Textarea
              label={S.chat.shortcuts.promptLabel}
              info={S.chat.shortcuts.promptInfo}
              infoLabel={S.common.moreInfoAbout(S.chat.shortcuts.promptLabel)}
              hint={S.chat.shortcuts.promptHint(SHORTCUT_PROMPT_MAX)}
              error={
                draftError === "promptTooLong"
                  ? S.chat.shortcuts.promptTooLong(SHORTCUT_PROMPT_MAX)
                  : undefined
              }
              value={draft.prompt}
              rows={8}
              size="sm"
              maxLength={SHORTCUT_PROMPT_MAX}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            />
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        title={S.chat.shortcuts.deleteTitle}
        confirmLabel={S.common.delete}
        cancelLabel={S.common.cancel}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting !== null) persist(removeShortcut(shortcuts, deleting.id));
          setDeleting(null);
        }}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {deleting !== null ? S.chat.shortcuts.deleteConfirm(deleting.title) : ""}
        </p>
      </ConfirmModal>
    </div>
  );
}
