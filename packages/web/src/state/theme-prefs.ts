/**
 * The appearance preferences as stored values: reading them back from `localStorage` with the
 * same validation the pre-paint boot script applies, and the attribute set they put on <html>.
 *
 * Pure on purpose — no React, no `window` — so the one place that decides what a stored value
 * means is testable against an in-memory store, and the provider (theme.tsx) only holds state.
 * Every key comes from the shared UI package, which also owns the boot script: the first frame and
 * the running app then cannot disagree about a stored value.
 *
 * The theme and the accent are validated by PATTERN, not by list, exactly as the script does: an
 * installation imports themes of its own (state/external-themes.ts) and each brings presets, so the
 * ids cannot be enumerated here. A well-formed id that names nothing paints nothing — the worst a
 * stale value costs is one frame's hairline — and an imported theme's id survives a reload even
 * before its file is read again.
 */
import { DEFAULT_THEME_ID, isThemeId } from "@adelie/ui";
import {
  FONT_CJK_OPTIONS,
  FONT_LATIN_OPTIONS,
  THEME_STORAGE_KEYS,
  readTextSize,
} from "@adelie/ui/boot";
import type { AccentChoice, FontCjk, FontLatin, TextSize, ThemeAttributes } from "@adelie/ui/boot";

export type { FontCjk, FontLatin, TextSize };

/** The storage a reader needs: `readTextSize` also writes, to retire the legacy key. */
export type PrefStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** "Use the theme's own face" — stored like any other choice, applied as no attribute at all. */
export const FONT_FOLLOWS_THEME = "theme";

/** A stored theme id this app may name on <html>: a shipped one, an imported one, or neither yet. */
export function readThemeId(storage: PrefStorage): string {
  const stored = storage.getItem(THEME_STORAGE_KEYS.themeId);
  return isThemeId(stored) ? stored : DEFAULT_THEME_ID;
}

/**
 * Any well-formed preset id is kept as stored: the theme files scope their presets to their own
 * root, so one the active theme does not list paints nothing (the theme's own accent shows) and
 * comes back when that theme is active again.
 */
export function readAccent(storage: PrefStorage): AccentChoice {
  const stored = storage.getItem(THEME_STORAGE_KEYS.accent);
  if (stored === "neutral") return stored;
  return isThemeId(stored) ? stored : "neutral";
}

/**
 * The accent a picker should mark under a theme: the stored preset when the theme offers it,
 * otherwise "neutral" — which is what the CSS paints in that case too. `offered` is the picker's
 * own list of values (state/external-themes.ts), so the same judgement covers a shipped theme, an
 * imported one and an id that names neither.
 */
export function effectiveAccent(accent: AccentChoice, offered: readonly string[]): AccentChoice {
  return accent === "neutral" || offered.includes(accent) ? accent : "neutral";
}

export function readFontLatin(storage: PrefStorage): FontLatin {
  const stored = storage.getItem(THEME_STORAGE_KEYS.fontLatin);
  return (
    FONT_LATIN_OPTIONS.find((option) => option.id === stored)?.id ??
    (FONT_FOLLOWS_THEME as FontLatin)
  );
}

export function readFontCjk(storage: PrefStorage): FontCjk {
  const stored = storage.getItem(THEME_STORAGE_KEYS.fontCjk);
  return (
    FONT_CJK_OPTIONS.find((option) => option.id === stored)?.id ?? (FONT_FOLLOWS_THEME as FontCjk)
  );
}

/**
 * The stored preferences, which are exactly what they put on <html> — `applyThemeAttributes`
 * takes this object as it is. The mode is the one attribute not here: it is resolved against
 * the media query first.
 */
export type ThemePrefs = Omit<ThemeAttributes, "dark">;

export function readThemePrefs(storage: PrefStorage): ThemePrefs {
  return {
    themeId: readThemeId(storage),
    accent: readAccent(storage),
    // Migrates the three-step `penguin.fontScale` of earlier releases on the way: the package's
    // reader maps it by pixels (sm → m, md → l, lg → xl), writes the new key and drops the old
    // one, so this happens once per browser and every later read is a plain lookup.
    textSize: readTextSize(storage),
    fontLatin: readFontLatin(storage),
    fontCjk: readFontCjk(storage),
  };
}
