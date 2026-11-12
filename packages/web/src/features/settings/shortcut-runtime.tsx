/**
 * Ties the keymap store to the signed-in account. Mounted once by AppLayout, next to the
 * terminal pool: after sign-in it reads the account's prefs and reconciles the browser mirror
 * against `keybindings` (the server wins; an edit made before the answer is pushed; an absent
 * copy clears a mirror that may belong to another account), and it installs the writer that
 * carries every later edit to `PUT /api/me/prefs`. The request itself is handed over — the store
 * remembers a refused write and the shortcuts page draws it (7.114), because the mirror was
 * already written and still stands: the next hydrate reconciles.
 */
import { useEffect } from "react";
import * as api from "../../api/endpoints";
import { hydrateFromServer, setKeybindingsPersister } from "../../lib/shortcuts/store";
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
      .catch(() => {
        // Unreachable preferences leave the mirror standing; the first keystroke still works.
      });
    return () => {
      cancelled = true;
      setKeybindingsPersister(null);
    };
  }, [userId]);
  return null;
}
