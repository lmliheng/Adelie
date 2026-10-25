/**
 * The themes an installation imported: read from the server, judged against the token contract,
 * and shaped for the pickers that offer them.
 *
 * WHY THIS IS THE APP'S JUDGEMENT AND NOT CORE'S. Core reads a theme file (shape, safety: its
 * internal/external-theme.ts) and the server turns the same files into the stylesheet the browser
 * links. Neither of them knows which token names exist — that is the UI package's contract — and
 * the app is the only place that depends on both, so the contract check lands here:
 *
 * - a name the contract has never heard of is REPORTED, because it paints nothing;
 * - a name the file leaves out is only a WARNING, because it falls through to the default theme's
 *   value — a half-filled theme paints, it is just more Primer than its author meant.
 *
 * WHAT THE PICKERS NEED. A theme is data here: its display name in both languages, its accent
 * presets (id plus the colour to paint the swatch with, taken from the file's own `--ui-accent`),
 * and the accent it paints when no preset is chosen. Nothing is cached across a page load: the
 * server reads the directory per request, so a file added while the page is open appears after one
 * "read again", and a file deleted stops painting on the next page load — its CSS is simply gone.
 */
import { useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_THEME_ID,
  THEME_OWN_ACCENTS,
  TOKEN_NAMES,
  isBuiltinTheme,
  themeAccentPresets,
} from "@adelie/ui";
import type { ExternalTheme } from "@adelie/core";
import { getImportedThemes } from "../api/endpoints";

/** One imported theme, as the appearance page reads it. */
export interface ImportedThemeView {
  /** The file it came from, under the themes directory. */
  readonly file: string;
  readonly id: string;
  /** Its name in English, and in Chinese when the file gives one. */
  readonly name: string;
  readonly nameZh?: string;
  /** The presets it lists, in the file's own order, each with the colour its swatch shows. */
  readonly presets: ReadonlyArray<{ readonly id: string; readonly swatch: string }>;
  /** The accent it paints when no preset is chosen, per mode (`neutral`'s swatch). */
  readonly own: { readonly light: string; readonly dark: string };
  /** Token names the contract has never heard of — they paint nothing. */
  readonly unknown: readonly string[];
  /** Token names the file does not set — they keep the default theme's values. */
  readonly missing: readonly string[];
}

export interface ImportedThemesState {
  /** The directory the server read, for the line that says where to put a file; null until read. */
  readonly dir: string | null;
  readonly themes: readonly ImportedThemeView[];
  /** Files that are not a theme, with the reason. */
  readonly rejected: ReadonlyArray<{ readonly file: string; readonly errors: readonly string[] }>;
  /** The request itself failed — the list is unknown rather than empty. */
  readonly failed: boolean;
}

const EMPTY: ImportedThemesState = { dir: null, themes: [], rejected: [], failed: false };

let state: ImportedThemesState = EMPTY;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: ImportedThemesState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** The default theme's own accent — what a name a theme leaves out ends up painting. */
const FALLBACK_ACCENT = THEME_OWN_ACCENTS[DEFAULT_THEME_ID];

/** The `--ui-accent` a token map sets, or null when it does not set one at all. */
function accentOf(tokens: Readonly<Record<string, string>> | undefined): string | null {
  return tokens?.["--ui-accent"] ?? null;
}

/** One file's theme as the page reads it, with the contract judged for both modes. */
export function viewOfTheme(file: string, theme: ExternalTheme): ImportedThemeView {
  const light = theme.light;
  const names = [
    ...Object.keys(light),
    ...Object.keys(theme.dark ?? {}),
    ...(theme.accents ?? []).flatMap((accent) => [
      ...Object.keys(accent.light),
      ...Object.keys(accent.dark ?? {}),
    ]),
  ];
  const contract: readonly string[] = TOKEN_NAMES;
  const ownLight = accentOf(light) ?? FALLBACK_ACCENT.light;
  return {
    file,
    id: theme.id,
    name: theme.name,
    ...(theme.nameZh === undefined ? {} : { nameZh: theme.nameZh }),
    presets: (theme.accents ?? []).map((accent) => ({
      id: accent.id,
      // What the preset paints in light mode; one that sets no `--ui-accent` paints nothing, so its
      // swatch is the theme's own accent — which is what the page shows.
      swatch: accentOf(accent.light) ?? ownLight,
    })),
    // `neutral` is the accent the theme itself paints: its own `--ui-accent` where it sets one, and
    // the default theme's where it does not (a name it leaves out keeps the default's value).
    own: { light: ownLight, dark: accentOf(theme.dark) ?? FALLBACK_ACCENT.dark },
    unknown: [...new Set(names.filter((name) => !contract.includes(name)))],
    missing: contract.filter((name) => !(name in light)),
  };
}

/** Re-reads the directory. Concurrent calls share one request; `force` re-reads after an answer. */
export function refreshImportedThemes(force = false): Promise<void> {
  if (pending) return pending;
  if (state.dir !== null && !force) return Promise.resolve();
  pending = getImportedThemes()
    .then((response) => {
      publish({
        dir: response.dir,
        themes: response.themes.map((entry) => viewOfTheme(entry.file, entry.theme)),
        rejected: response.rejected.map(({ file, errors }) => ({ file, errors: [...errors] })),
        failed: false,
      });
      // A forced read means "the directory may have changed since this page loaded", which is
      // exactly when the sheet the page already applied is stale.
      if (force) rereadThemeSheet();
    })
    .catch(() => publish({ ...EMPTY, failed: true }))
    .finally(() => {
      pending = null;
    });
  return pending;
}

/**
 * Re-reads the stylesheet the page links, by pointing that link at the same sheet through a fresh
 * URL.
 *
 * WHY THIS IS HERE AND NOT THE BROWSER'S BUSINESS: a stylesheet is fetched once per document, and
 * this one is fetched at load — before anyone could have imported anything. So a theme that arrives
 * from the import dialog would be offered by the picker and paint NOTHING until the page was
 * reloaded, which reads as a theme that does not work; the same goes for a file dropped into the
 * directory while the page is open and then "read again". Re-pointing the link is what makes the
 * browser fetch the sheet as it is now (the server reads the directory per request and sends
 * `no-cache`); the extra parameter only says "again" and means nothing to the server.
 *
 * Guarded because this module is also read where there is no document (the unit suite runs it in
 * node): there is no link to re-point there, and no paint to correct.
 */
function rereadThemeSheet(): void {
  if (typeof document === "undefined") return;
  const link = document.querySelector('link[rel="stylesheet"][href^="/api/themes.css"]');
  if (link === null) return;
  link.setAttribute("href", `/api/themes.css?again=${Date.now()}`);
}

/** Test seam: drop what was read, so the next read asks the server again. */
export function resetImportedThemes(): void {
  state = EMPTY;
  pending = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** What was read last: the same value the hook returns, for anything outside a component. */
export function importedThemes(): ImportedThemesState {
  return state;
}

/** The imported themes of this installation, read once per page load. */
export function useImportedThemes(): ImportedThemesState {
  const current = useSyncExternalStore(subscribe, importedThemes);
  useEffect(() => {
    void refreshImportedThemes();
  }, []);
  return current;
}

/**
 * The swatches a theme offers, for the accent picker: "neutral" first (the theme's own accent),
 * then its presets. A shipped theme's presets are the package's own tables; an imported one's come
 * from its file; an id that names neither offers only "neutral" — which is all the CSS paints for
 * it either.
 */
export function accentSwatches(
  themeId: string,
  dark: boolean,
  imported: readonly ImportedThemeView[],
): ReadonlyArray<{ value: string; color: string }> {
  const mode = dark ? "dark" : "light";
  const view = imported.find((theme) => theme.id === themeId);
  const own = view
    ? view.own[mode]
    : THEME_OWN_ACCENTS[isBuiltinTheme(themeId) ? themeId : DEFAULT_THEME_ID][mode];
  const presets = view ? view.presets : themeAccentPresets(themeId);
  return [
    { value: "neutral", color: own },
    ...presets.map((preset) => ({ value: preset.id, color: preset.swatch })),
  ];
}
