/**
 * Preferences the docs site stores.
 *
 * The keys are the ones the docs shared with the site they were deployed beside — upstream's
 * landing page at the origin root — so a language or theme choice survived the hop between the
 * two SPAs. The retired per-site names below are still read once for the same reason: a visitor
 * who picked dark mode on the landing page and clicked through used to land back in light, and
 * that read is what keeps an existing choice from being dropped.
 * In this repository the docs are the whole site: the root `/Adelie/` is a one-page redirect to
 * `/Adelie/docs/`. The KEYS stay exactly as they are, because a stored choice is keyed on them.
 *
 * The `packages/landing` copy this module was duplicated in is gone from this repository; if it
 * ever comes back, the KEYS have to match on both sides, since a drift makes the sync stop
 * silently rather than fail.
 */

export const THEME_KEY = "penguin-site.theme";
export const LANG_KEY = "penguin-site.lang";

/** Pre-unification keys, still read once so an existing visitor keeps their choice. */
const LEGACY_KEYS: Record<string, readonly string[]> = {
  [THEME_KEY]: ["penguin-landing.theme", "penguin-docs.theme"],
  [LANG_KEY]: ["penguin-landing.lang", "penguin-docs.lang"],
};

/**
 * Reads a stored preference, falling back to the retired per-site keys. Everything is
 * wrapped: localStorage throws outright in a cookie-blocked or partitioned context, and
 * a preference is never worth taking the page down for.
 */
export function readPref<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    for (const k of [key, ...(LEGACY_KEYS[key] ?? [])]) {
      const stored = localStorage.getItem(k);
      if (stored && (allowed as readonly string[]).includes(stored)) return stored as T;
    }
  } catch {
    // Storage unavailable — fall through to the system default.
  }
  return null;
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Non-persistent session: the choice still applies for this page.
  }
}

/**
 * Live sync for the both-tabs-open case. The storage event fires in every *other* tab on
 * the origin, so switching theme on the landing page updates an already-open docs tab
 * without a reload. Navigating between the two sites is a full page load and is covered
 * by the read on mount instead.
 */
export function subscribePref<T extends string>(
  key: string,
  allowed: readonly T[],
  onChange: (value: T) => void,
): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key !== key || e.newValue === null) return;
    if ((allowed as readonly string[]).includes(e.newValue)) onChange(e.newValue as T);
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
