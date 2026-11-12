/**
 * Ties the keymap store to the signed-in account. Mounted once by AppLayout, next to the
 * terminal pool: after sign-in it reads the account's prefs and reconciles the browser mirror
 * against `keybindings` (the server wins; an edit made before the answer is pushed; an absent
 * copy clears a mirror that may belong to another account), and it installs the writer that
 * carries every later edit to `PUT /api/me/prefs`. The request itself is handed over — the store
 * remembers a refused write and the shortcuts page draws it (7.114), because the mirror was
 * already written and still stands: the next hydrate reconciles. A read that never answers is
 * remembered the same way (7.115): the mirror then stands in for the account's copy, and every
 * edit writes it back whole.
 */
import { useEffect } from "react";
import * as api from "../../api/endpoints";
import {
  hydrateFromServer,
  noteHydrateFailure,
  setKeybindingsPersister,
} from "../../lib/shortcuts/store";
import { useAuth } from "../../state/auth";

export function ShortcutRuntime() {
  const { user } = useAuth();
  const userId = user?.userId ?? null;
  useEffect(() => {
    if (userId === null) return;
    setKeybindingsPersister((doc) => api.putPrefs({ keybindings: doc }));
    let cancelled = false;
    void api
      .getPrefs()
      .then((res) => {
        if (!cancelled) hydrateFromServer(res.prefs.keybindings);
      })
      .catch((error: unknown) => {
        // The mirror keeps the keyboard working, but nothing has read the account's copy: say so on
        // the page that holds the edits rather than leave the rows looking like the account's.
        if (!cancelled) noteHydrateFailure(error);
      });
    return () => {
      cancelled = true;
      setKeybindingsPersister(null);
    };
  }, [userId]);
  return null;
}
