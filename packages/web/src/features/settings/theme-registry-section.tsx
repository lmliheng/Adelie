/**
 * The theme library: the remote catalogue this installation can import themes from, drawn under the
 * theme picker as a row of cards.
 *
 * A CARD IS A THEME AND A BUTTON, nothing more: the four colours the registry published for it (both
 * modes, so a dark-only theme is visible in a light page), its name in the reader's language, its
 * author, its description, and one import. Nothing here fetches a theme file to show a preview — the
 * catalogue carries exactly those four colours for that reason, and the whole file arrives when the
 * operator decides to install it.
 *
 * WHO SEES IT: an admin, because an import is the only thing a card offers and the routes are the
 * admin's (every browser that signs in on this machine is painted by what lands in the themes
 * directory). Offering the cards to a member would be a list of things they cannot have.
 *
 * A LIBRARY THAT CANNOT BE READ IS A LINE, NOT AN EMPTY PAGE. The server answers 200 with the reason
 * (`registry_unavailable`, `registry_invalid`, `registry_unusable`), the card grid is empty, and the
 * page's own themes above are untouched — this row is an addition to the picker, never a dependency
 * of it. "Refresh" asks again; the index is cached server-side for five minutes, so a hand-edited
 * mirror needs no restart, just patience or a fresh base address.
 *
 * A SECOND IMPORT OF THE SAME THEME is the same question the file dialog asks: 409 `theme_exists`
 * opens the overwrite confirmation, whose confirm resends with `overwrite: true`. The card carries
 * "installed" from the server's answer (it compares the catalogue against the directory per
 * request), so after an import the grid is re-read rather than guessed at.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, ConfirmModal, InfoPopover, toastError, toastSuccess } from "@adelie/ui";
import type { ThemeRegistryResponse, ThemeRegistryTheme } from "@adelie/server/api";
import * as api from "../../api/endpoints";
import { ApiError } from "../../api/client";
import { S } from "../../lib/strings";
import { useLocale } from "../../state/locale";
import { localizedText } from "../chat/skill-use";
import { themeImportErrorText } from "./theme-import";

/** One mode's four colours, filled in where the catalogue left a name out. */
type ModeColours = Readonly<Record<string, string>>;

/** The two modes a card paints; each half of the chip is its own mode. */
function modalColours(entry: ThemeRegistryTheme): { light?: ModeColours; dark?: ModeColours } {
  return { light: entry.swatch?.light, dark: entry.swatch?.dark };
}

/**
 * The chip: each mode the catalogue described, side by side — its canvas, a surface bar, the ink it
 * writes with and the accent beside it. A mode it did not describe is simply absent, which is why a
 * dark-only theme paints one half rather than a half of invented colours.
 */
function RegistryChip({ entry }: { entry: ThemeRegistryTheme }) {
  const modes = modalColours(entry);
  const halves = (["light", "dark"] as const)
    .map((mode) => ({ mode, colours: modes[mode] }))
    .filter((half): half is { mode: "light" | "dark"; colours: ModeColours } => !!half.colours);
  if (halves.length === 0) {
    return (
      <span
        aria-hidden
        className="flex h-9 items-center justify-center rounded-[var(--ui-radius-sm)] border border-dashed border-line text-xs text-fg-subtle"
      >
        {S.settings.themeRegistry}
      </span>
    );
  }
  return (
    <span aria-hidden className="flex h-9 overflow-hidden rounded-[var(--ui-radius-sm)]">
      {halves.map(({ mode, colours }) => (
        <span
          key={mode}
          className="relative min-w-0 flex-1"
          style={{ background: colours["--ui-canvas"] }}
        >
          <span
            className="absolute inset-x-1 top-1 block rounded-[2px]"
            style={{
              background: colours["--ui-surface"],
              border: `1px solid ${colours["--ui-fg"] ?? "transparent"}22`,
              height: "0.5rem",
            }}
          />
          <span
            className="absolute bottom-1 left-1 block rounded-full"
            style={{ background: colours["--ui-accent"], height: "0.25rem", width: "0.75rem" }}
          />
          <span
            className="absolute bottom-1 right-1 block rounded-full"
            style={{
              background: colours["--ui-fg"],
              height: "0.25rem",
              opacity: 0.45,
              width: "0.5rem",
            }}
          />
        </span>
      ))}
    </span>
  );
}

function RegistryCard({
  entry,
  locale,
  busy,
  onInstall,
}: {
  entry: ThemeRegistryTheme;
  locale: "zh" | "en";
  busy: boolean;
  onInstall: () => void;
}) {
  const description =
    entry.description === undefined
      ? null
      : localizedText(locale, entry.description, entry.descriptionZh);
  const version = entry.version === undefined ? null : `v${entry.version}`;
  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--ui-radius-md)] border border-line bg-surface p-2">
      <RegistryChip entry={entry} />
      <p className="min-w-0">
        <span className="block truncate text-sm text-fg-emphasis">
          {localizedText(locale, entry.name, entry.nameZh)}
        </span>
        <span className="block truncate text-xs text-fg-subtle">
          {S.settings.themeRegistryBy(entry.author)}
          {version === null ? "" : ` · ${version}`}
        </span>
      </p>
      {description !== null && <p className="line-clamp-2 text-xs text-fg-muted">{description}</p>}
      <span className="mt-auto flex items-center gap-1.5 pt-0.5">
        {entry.installed && (
          <span className="text-xs text-fg-subtle">{S.settings.themeRegistryInstalled}</span>
        )}
        <Button
          size="sm"
          variant={entry.installed ? "ghost" : "secondary"}
          className="ml-auto"
          disabled={busy}
          onClick={onInstall}
        >
          {busy
            ? S.settings.themeImportBusy
            : entry.installed
              ? S.settings.themeRegistryReimport
              : S.settings.themeRegistryImport}
        </Button>
      </span>
    </div>
  );
}

/** Which entry is waiting on the overwrite confirmation. */
interface Pending {
  readonly id: string;
  readonly name: string;
}

export function ThemeRegistrySection({
  onImported,
}: {
  /** Called after an import landed: re-read the imported list, so the new theme is in the picker. */
  onImported: () => Promise<void> | void;
}) {
  const { locale } = useLocale();
  const [catalogue, setCatalogue] = useState<ThemeRegistryResponse | null>(null);
  const [reading, setReading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setReading(true);
    try {
      const res = await api.getThemeRegistry();
      setCatalogue(res);
      setFailed(false);
    } catch {
      // The request itself failed (not the registry): the shared sentence, and a row that can be
      // asked again rather than a page that pretends there is no library.
      setFailed(true);
    } finally {
      setReading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const install = async (entry: ThemeRegistryTheme, overwrite: boolean) => {
    setBusyId(entry.id);
    try {
      const res = await api.importThemeFromRegistry({
        id: entry.id,
        ...(overwrite ? { overwrite } : {}),
      });
      setPending(null);
      toastSuccess(
        S.settings.themeRegistryImported(localizedText(locale, res.theme.name, res.theme.nameZh)),
      );
      // The picker first (that is what the reader came here for), then the catalogue: its
      // "installed" marks are the server's reading of the directory, not a guess of ours.
      await onImported();
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === "theme_exists") {
        setPending({ id: entry.id, name: localizedText(locale, entry.name, entry.nameZh) });
      } else {
        setPending(null);
        toastError(themeImportErrorText(e));
      }
    } finally {
      setBusyId(null);
    }
  };

  const error = catalogue?.error ?? null;
  const themes = catalogue?.themes ?? [];

  return (
    <div className="space-y-2 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs text-fg-muted">
          {S.settings.themeRegistry}
          <InfoPopover label={S.settings.themeRegistryInfo}>
            <div className="space-y-1.5">
              <p>{S.settings.themeRegistryInfo}</p>
              {catalogue?.base != null && <p className="font-mono break-all">{catalogue.base}</p>}
            </div>
          </InfoPopover>
        </p>
        <Button size="sm" variant="ghost" disabled={reading} onClick={() => void load()}>
          {S.settings.themeRegistryReadAgain}
        </Button>
      </div>

      {reading && catalogue === null && (
        <p className="text-xs text-fg-subtle">{S.settings.themeRegistryLoading}</p>
      )}
      {failed && <p className="text-xs text-fg-subtle">{S.settings.themeRegistryFailed}</p>}
      {/* A catalogue that answered with a reason is a line, not an empty grid: the reader has to
          know the difference between "nothing there" and "could not look". */}
      {error !== null && (
        <p className="text-xs break-words text-fg-subtle">
          {error.code === "registry_invalid"
            ? S.settings.themeRegistryInvalid(error.message)
            : error.code === "registry_unusable"
              ? S.settings.themeRegistryUnusable
              : S.settings.themeRegistryFailed}
        </p>
      )}
      {!reading && error === null && !failed && themes.length === 0 && (
        <p className="text-xs text-fg-subtle">{S.settings.themeRegistryEmpty}</p>
      )}
      {themes.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {themes.map((entry) => (
            <RegistryCard
              key={entry.id}
              entry={entry}
              locale={locale}
              busy={busyId === entry.id}
              onInstall={() => void install(entry, entry.installed)}
            />
          ))}
        </div>
      )}

      {pending !== null && (
        <ConfirmModal
          open
          title={S.settings.themeImportOverwriteTitle}
          tone="primary"
          confirmLabel={S.settings.themeImportOverwriteAction}
          cancelLabel={S.common.cancel}
          busy={busyId !== null}
          onClose={() => setPending(null)}
          onConfirm={() => {
            const entry = themes.find((candidate) => candidate.id === pending.id);
            if (entry !== undefined) void install(entry, true);
          }}
        >
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {S.settings.themeImportOverwriteBody}
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
