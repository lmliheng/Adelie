/**
 * Set homepage: the page a new tab opens and the toolbar's Home button goes to. The field
 * reads an entry the way the address bar does (address.ts) — a bare domain gets https, other
 * words become a search — and its hint shows the page the entry will open. "Use current page"
 * takes the page on screen and "Clear" empties the field; saving an empty field removes the
 * homepage, so new tabs open blank again and the Home button goes away.
 *
 * A save that fails keeps the dialog open on the entry, and the reason stays UNDER THE FIELD it
 * is about — the entry is still there to be corrected and the Save button beside it is what
 * retries. A notification said the same words over an open dialog and left six seconds later,
 * after which the dialog read exactly as it did before the press. The sentence belongs to the
 * attempt that produced it, so any edit of the field (typing, "Use current page", "Clear") and
 * the next press each clear it.
 *
 * Mounted for one opening at a time (the panel renders it only while it is open), so every
 * opening starts from the homepage as saved.
 */
import { useState } from "react";
import { Button, Input, Modal } from "@adelie/ui";
import * as api from "../../api/endpoints";
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";
import { toneInk } from "../../lib/tone";
import { homepageFromInput } from "./address";
import { dispatchBrowser } from "./browser-store";

export function HomepageDialog({
  homepage,
  currentPage,
  onClose,
}: {
  /** The homepage as saved; null for none. */
  homepage: string | null;
  /** The web page on screen, which "Use current page" takes; null when there is none. */
  currentPage: string | null;
  onClose: () => void;
}) {
  const [text, setText] = useState(homepage ?? "");
  const [saving, setSaving] = useState(false);
  /** The last failed save's sentence; belongs to the entry it was about. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const target = homepageFromInput(text);

  /**
   * Every change of the entry — typing, "Use current page", "Clear" — makes the sentence about
   * the last attempt stale: the words named an address that is no longer in the field.
   */
  const edit = (next: string) => {
    setRefusal(null);
    setText(next);
  };

  const save = async () => {
    if (saving) return;
    // Cleared before the request, so a refusal that repeats reads as the answer to THIS press
    // rather than as a sentence that never went away.
    setRefusal(null);
    setSaving(true);
    try {
      const saved = await api.putBuiltinBrowserSettings({ homepage: target });
      dispatchBrowser({ type: "settings", settings: saved });
      onClose();
    } catch (err) {
      // The dialog stays open with the entry, so the save can be tried again — and the reason
      // stays beside that entry rather than in a notification over the dialog.
      setRefusal(S.builtinBrowser.homepageFailed(refusalText(err)));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={S.builtinBrowser.homepageTitle}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose} disabled={saving}>
            {S.common.cancel}
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? S.common.saving : S.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">{S.builtinBrowser.homepageIntro}</p>
        <Input
          size="sm"
          autoFocus
          data-testid="builtin-browser-homepage-input"
          label={S.builtinBrowser.homepageAddress}
          hint={
            target === null
              ? S.builtinBrowser.homepageHintEmpty
              : S.builtinBrowser.homepageHintOpens(target)
          }
          placeholder={S.builtinBrowser.homepagePlaceholder}
          spellCheck={false}
          value={text}
          disabled={saving}
          onChange={(e) => edit(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void save();
          }}
        />
        {/* Right under the entry, inside the dialog that asked: the address it names is the
            field above, and the Save button below is what retries. Clamped to two lines because
            a server's message can run long; the whole sentence stays on hover. */}
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={currentPage === null || saving}
            onClick={() => {
              if (currentPage !== null) edit(currentPage);
            }}
          >
            {S.builtinBrowser.homepageUseCurrent}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={text === "" || saving}
            onClick={() => edit("")}
          >
            {S.builtinBrowser.homepageClear}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
