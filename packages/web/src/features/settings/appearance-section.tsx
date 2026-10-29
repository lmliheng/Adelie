/**
 * Appearance page: the look-and-feel preferences. Theme, light or dark, accent, text size and
 * font pairing come first, since each restyles the whole app. Everything applies on the spot
 * (the theme store persists per browser), so there is no Save button. The terminal keeps its
 * own theme row because plenty of people pin a dark terminal inside a light app; it follows
 * the app unless pinned (see TerminalThemeMode). The workbench launcher's row is here rather
 * than with the chat's own settings because it is the same kind of choice: whether a piece of
 * chrome is drawn. The tool short-name row is here for the same reason — it changes how a
 * tool call is spelled on screen, never what runs. So are the last two rows, the only chrome here
 * that is not drawn by this page at all: the desktop shell's tray icon and its pet window. Both
 * belong to the shell, only the shell's own window may reach them (see isDesktopShellWindow), so
 * both rows are absent in a browser.
 *
 * THEMES AN INSTALLATION IMPORTED are rows of the theme picker like the three the UI package
 * ships, and they arrive as data: this page lists them, paints their accents and says what a file
 * got wrong — the file games no say in the layout, because a theme is only values (see
 * state/external-themes.ts). The row under the picker is the two things one can do about that
 * directory — read it again, or import a file into it — because nothing here discovers files by
 * itself: the browser cannot see the server's disk. Where a file goes, and the shape of one, sit
 * behind the "?" beside those two actions: they answer a question asked once, and printed in full
 * they were a paragraph every later visit scrolled past. An admin gets the second action, for the
 * same install without the walk to the folder, and it is the server's own rule that decides who
 * may use it: the routes answer 403 to anyone else, so the entry is drawn for an admin only rather
 * than offered and refused.
 *
 * AND A LIBRARY BESIDE THE FOLDER. A theme can also arrive from a remote catalogue (the registry
 * routes) — the same installation, one fetch the server makes instead of the operator — so the page
 * carries its cards under the same picker, again for an admin only, because importing is the one
 * thing a card offers. Its own state is its own: a library nobody can reach leaves the picker and
 * the folder row exactly as they were.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Button,
  InfoPopover,
  PrefRow,
  PrefRowLabel,
  Segmented,
  Select,
  SwatchPicker,
  THEME_IDS,
  ToggleRow,
} from "@adelie/ui";
import { FONT_CJK_OPTIONS, FONT_LATIN_OPTIONS, TEXT_SIZES } from "@adelie/ui/boot";
import { S } from "../../lib/strings";
import * as api from "../../api/endpoints";
import { isDesktopShellWindow } from "../../lib/account-menu";
import {
  launcherHiddenVersion,
  readLauncherHidden,
  subscribeLauncherHidden,
  writeLauncherHidden,
} from "../dock/dock-launcher-state";
import { useAuth } from "../../state/auth";
import { useLocale } from "../../state/locale";
import { useTheme } from "../../state/theme";
import type { FontCjk, FontLatin, ThemeMode, TerminalThemeMode, TextSize } from "../../state/theme";
import {
  accentSwatches,
  refreshImportedThemes,
  useImportedThemes,
} from "../../state/external-themes";
import type { ImportedThemesState } from "../../state/external-themes";
import { localizedText } from "../chat/skill-use";
import { FONT_FOLLOWS_THEME, effectiveAccent } from "../../state/theme-prefs";
import { ThemeImportActions } from "./theme-import-dialog";
import { ThemePicker } from "./theme-picker";
import { ThemeRegistrySection } from "./theme-registry-section";

/**
 * A font select's choices: the theme's own face first — it is the default, and the named faces
 * are the opt-out — then the faces the package lists. The package names each bundled face by
 * its proper name, the same in both languages; "theme" and "system" are not names, so their
 * words come from this app's dictionaries.
 */
export function fontChoices<T extends string>(
  options: ReadonlyArray<{ id: T; label: string }>,
): Array<{ value: T; label: string }> {
  return [
    { value: FONT_FOLLOWS_THEME as T, label: S.settings.fontFollowTheme },
    ...options
      .filter((option) => option.id !== FONT_FOLLOWS_THEME)
      .map((option) => ({
        value: option.id,
        label: option.id === "system" ? S.settings.fontSystem : option.label,
      })),
  ];
}

/** One of the two font selects, with the short visible name that tells the pair apart. */
function FontSelect<T extends string>({
  name,
  value,
  choices,
  onChange,
}: {
  name: string;
  value: T;
  choices: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        className="shrink-0 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400"
      >
        {name}
      </span>
      <span className="w-36 min-w-0 shrink">
        <Select
          aria-label={`${S.settings.fonts} · ${name}`}
          value={value}
          onChange={(e) => {
            const next = choices.find((choice) => choice.value === e.target.value);
            if (next) onChange(next.value);
          }}
        >
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
      </span>
    </span>
  );
}

/** Whether the picker already offers this id: one the package ships, or one a file brought. */
function themeIdOptionsInclude(state: ImportedThemesState, themeId: string): boolean {
  return (
    (THEME_IDS as readonly string[]).includes(themeId) ||
    state.themes.some((theme) => theme.id === themeId)
  );
}

/** Token names in the reader's own separator, at most five of them spelled out. */
function nameList(names: readonly string[], locale: "zh" | "en"): string {
  const separator = locale === "zh" ? "、" : ", ";
  const shown = names.slice(0, 5).join(separator);
  return names.length <= 5 ? shown : `${shown} ${S.settings.importedThemesMore(names.length - 5)}`;
}

/**
 * What this installation imported, under the theme picker: what one can do about the directory —
 * read it again, and (as an admin) import a file into it — plus one line per thing that did not
 * come out right.
 *
 * WHERE A FILE GOES IS BEHIND THE "?". The path, the shape of a file and the fact that importing
 * is install-level are read once and then never again; spelled out under the picker they were a
 * paragraph every later visit scrolled past, with the two actions they explained buried in it. The
 * actions are the row now, and the prose is one click away. A failed read keeps the row — "read
 * again" is the retry — and adds the one line that says the list is unknown rather than empty.
 *
 * An imported theme that is merely FILLED IN PARTLY says so here and still paints — a name it
 * leaves out keeps the default theme's value — while a file that would not read is reported with
 * the reason the server gave, because its author has to see it somewhere.
 */
function ImportedThemesNote({
  state,
  activeId,
  locale,
  canImport,
}: {
  state: ImportedThemesState;
  activeId: string;
  locale: "zh" | "en";
  /** Whether the reader may import one: the entry is the server's own admin rule, drawn or not. */
  canImport: boolean;
}) {
  const [reading, setReading] = useState(false);
  const problems = state.themes.filter(
    (theme) => theme.unknown.length > 0 || theme.missing.length > 0,
  );
  const orphan = themeIdOptionsInclude(state, activeId) ? null : activeId;
  return (
    <div className="space-y-1.5 py-3 text-xs text-fg-subtle">
      <div className="flex flex-wrap items-center gap-2">
        {/* The row's subject, then the "?" that answers where a file goes — a "?" needs a title
            beside it to modify (see packages/ui's InfoPopover), and "read again" needs one to say
            what it reads. */}
        <p className="flex items-center gap-1.5 text-fg-muted">
          {S.settings.importedThemesHelp}
          <InfoPopover label={S.settings.importedThemesHelp}>
            <div className="space-y-1.5">
              {state.dir !== null && <p className="font-mono break-all">{state.dir}</p>}
              <p>{S.settings.importedThemesHint}</p>
            </div>
          </InfoPopover>
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={reading}
          onClick={() => {
            setReading(true);
            void refreshImportedThemes(true).finally(() => setReading(false));
          }}
        >
          {S.settings.importedThemesReadAgain}
        </Button>
        {/* The file that would have been dropped into that directory, put there instead. */}
        {canImport && <ThemeImportActions onImported={() => refreshImportedThemes(true)} />}
      </div>
      {state.failed && <p>{S.settings.importedThemesFailed}</p>}
      {orphan !== null && <p>{S.settings.importedThemesNoFile(orphan)}</p>}
      {/* One line per theme with something to say, and the token names one click away: a theme is
          allowed to set only what it changes, so "a hundred names keep the default" is the normal
          case and printing them all buried the row under a wall of --ui- names. */}
      {problems.map((theme) => (
        <details key={theme.id}>
          <summary className="cursor-pointer text-fg-muted">
            {localizedText(locale, theme.name, theme.nameZh)}
            {" · "}
            {[
              theme.unknown.length > 0 &&
                S.settings.importedThemeUnknownShort(theme.unknown.length),
              theme.missing.length > 0 &&
                S.settings.importedThemeMissingShort(theme.missing.length),
            ]
              .filter(Boolean)
              .join(locale === "zh" ? "、" : ", ")}
            <span className="ml-1 text-fg-subtle">{S.settings.importedThemeDetails}</span>
          </summary>
          <div className="mt-1 space-y-1 pl-3">
            {theme.unknown.length > 0 && (
              <p>
                {S.settings.importedThemeUnknown(
                  theme.unknown.length,
                  nameList(theme.unknown, locale),
                )}
              </p>
            )}
            {theme.missing.length > 0 && (
              <p>
                {S.settings.importedThemeMissing(
                  theme.missing.length,
                  nameList(theme.missing, locale),
                )}
              </p>
            )}
          </div>
        </details>
      ))}
      {state.rejected.map(({ file, errors }) => (
        <p key={file} className="font-mono break-all">
          {S.settings.importedThemeRejected(file, errors.join(locale === "zh" ? "；" : "; "))}
        </p>
      ))}
    </div>
  );
}

export function AppearanceSection() {
  const {
    mode,
    setMode,
    themeId,
    setThemeId,
    textSize,
    setTextSize,
    fontLatin,
    setFontLatin,
    fontCjk,
    setFontCjk,
    accent,
    setAccent,
    terminalMode,
    setTerminalMode,
    toolAliases,
    setToolAliases,
    dark,
  } = useTheme();
  const { locale } = useLocale();
  // What this installation imported, read once per page load (the server reads the directory per
  // request, so the note below can ask for it again).
  const imported = useImportedThemes();
  // The fan's "hide launcher" entry writes the same preference, so this row follows it.
  useSyncExternalStore(subscribeLauncherHidden, launcherHiddenVersion);
  const launcherShown = !readLauncherHidden();
  const { user, desktopMode, sessionVia } = useAuth();
  const offersShellChrome = isDesktopShellWindow({ desktopMode, sessionVia });
  // The shell owns this one, so it is fetched rather than read from a store. Anything the
  // shell has not told us — no push yet, a request that failed — reads as on, the shell's
  // own default, so the row never claims the icon is off while it is sitting in the tray.
  const [trayIcon, setTrayIcon] = useState(true);
  useEffect(() => {
    if (!offersShellChrome) return;
    let live = true;
    void api.getDesktopTray().then(
      (res) => {
        if (live) setTrayIcon(res.status?.showTrayIcon ?? true);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [offersShellChrome]);
  // Optimistic: the switch answers the click, and a refused write snaps it back rather
  // than leaving the row disagreeing with the icon the user is looking at.
  const changeTrayIcon = (next: boolean): void => {
    setTrayIcon(next);
    void api.setDesktopTray({ showTrayIcon: next }).catch(() => setTrayIcon(!next));
  };

  // The pet window, read the same way and from the shell's own default the other way round: the
  // pet is off unless something says otherwise, so an answer that has not arrived yet reads as
  // off — the row must not claim a penguin is on the desktop when there is none.
  const [showPet, setShowPet] = useState(false);
  useEffect(() => {
    if (!offersShellChrome) return;
    let live = true;
    void api.getDesktopPet().then(
      (res) => {
        if (live) setShowPet(res.status?.showPet ?? false);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [offersShellChrome]);
  const changeShowPet = (next: boolean): void => {
    setShowPet(next);
    void api.setDesktopPet({ showPet: next }).catch(() => setShowPet(!next));
  };

  const themeOptions: ReadonlyArray<{ value: ThemeMode; label: string }> = [
    { value: "light", label: S.settings.themeLight },
    { value: "dark", label: S.settings.themeDark },
    { value: "system", label: S.settings.followSystem },
  ];
  // Follow-the-app first: it is the default, and the pinned modes are the opt-out.
  const terminalThemeOptions: ReadonlyArray<{ value: TerminalThemeMode; label: string }> = [
    { value: "app", label: S.settings.followAppTheme },
    { value: "light", label: S.settings.themeLight },
    { value: "dark", label: S.settings.themeDark },
  ];
  const swatches = accentSwatches(themeId, dark, imported.themes);
  const textSizeOptions: ReadonlyArray<{ value: TextSize; label: string }> = TEXT_SIZES.map(
    (size) => ({ value: size, label: S.settings.textSizeNames[size] }),
  );

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
      {/* The picker is a grid, not a control beside the label: it needs the row's whole width to
          wrap into, which the row's own control slot does not give it. */}
      <div className="py-3.5 first:pt-0">
        <PrefRowLabel label={S.settings.theme} info={S.settings.themeInfo} />
        <ThemePicker
          imported={imported.themes}
          value={themeId}
          onChange={setThemeId}
          dark={dark}
          locale={locale}
        />
      </div>
      <ImportedThemesNote
        state={imported}
        activeId={themeId}
        locale={locale}
        canImport={user?.isAdmin === true}
      />
      {/* The remote catalogue, for an admin only: a card's one action is an import, which is the
          admin's to make — a member would be shown a list of themes they cannot have. */}
      {user?.isAdmin === true && (
        <ThemeRegistrySection onImported={() => refreshImportedThemes(true)} />
      )}{" "}
      <PrefRow label={S.settings.colorMode} info={S.settings.colorModeInfo}>
        <Segmented options={themeOptions} value={mode} onChange={setMode} />
      </PrefRow>
      {/* The swatches are the active theme's own; a stored preset it does not offer is shown
          as the theme's own accent, which is what the page paints, and comes back with the
          theme that offers it. */}
      <PrefRow label={S.settings.accent} info={S.settings.accentInfo}>
        <SwatchPicker
          options={swatches.map((swatch) => ({
            ...swatch,
            label: S.settings.accentNames[swatch.value] ?? swatch.value,
          }))}
          value={effectiveAccent(
            accent,
            swatches.map((swatch) => swatch.value),
          )}
          onChange={setAccent}
        />
      </PrefRow>
      <PrefRow label={S.settings.fontSize} info={S.settings.fontSizeInfo}>
        <Segmented options={textSizeOptions} value={textSize} onChange={setTextSize} cols={5} />
      </PrefRow>
      <PrefRow label={S.settings.fonts} info={S.settings.fontsInfo}>
        {/* One line always: the pair shrinks rather than wraps (a wrapped pair read as two
            settings under the stacked label a theme may give this row). */}
        <div className="flex min-w-0 items-center justify-end gap-x-3">
          <FontSelect<FontLatin>
            name={S.settings.fontLatin}
            value={fontLatin}
            choices={fontChoices(FONT_LATIN_OPTIONS)}
            onChange={setFontLatin}
          />
          <FontSelect<FontCjk>
            name={S.settings.fontCjk}
            value={fontCjk}
            choices={fontChoices(FONT_CJK_OPTIONS)}
            onChange={setFontCjk}
          />
        </div>
      </PrefRow>
      <PrefRow label={S.settings.terminalTheme} info={S.settings.terminalThemeInfo}>
        <Segmented options={terminalThemeOptions} value={terminalMode} onChange={setTerminalMode} />
      </PrefRow>
      <ToggleRow
        label={S.settings.launcher}
        info={S.settings.launcherInfo}
        checked={launcherShown}
        onChange={(shown) => writeLauncherHidden(!shown)}
      />
      <ToggleRow
        label={S.settings.toolAliases}
        info={S.settings.toolAliasesInfo}
        checked={toolAliases}
        onChange={setToolAliases}
      />
      {offersShellChrome && (
        <ToggleRow
          label={S.settings.trayIcon}
          info={S.settings.trayIconInfo}
          checked={trayIcon}
          onChange={changeTrayIcon}
        />
      )}
      {offersShellChrome && (
        <ToggleRow
          label={S.settings.showPet}
          info={S.settings.showPetInfo}
          checked={showPet}
          onChange={changeShowPet}
        />
      )}
    </div>
  );
}
