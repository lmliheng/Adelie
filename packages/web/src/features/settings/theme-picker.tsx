/**
 * The theme picker: every theme as a card that shows the colours it paints, not only its name.
 *
 * WHY CARDS AND NOT A SEGMENTED ROW. A segmented row gives each theme one word of room, so the
 * list stops fitting the moment an installation imports a few files — the row either wraps into a
 * block of chips or scrolls sideways, and either way the reader is choosing between names they
 * cannot see. A grid of cards costs the same vertical band, wraps instead of overflowing, scrolls
 * once it outgrows that band, and shows what each choice looks like where the name would be alone.
 *
 * THE CHIP IS PAINTED FROM DATA. An imported theme's four colours come from its own file (the same
 * values its stylesheet is generated from). The three themes the package ships cannot be read that
 * way — their rules answer `:root[data-theme="…"]`, one theme at a time, so a page showing three of
 * them at once would have to repaint itself per card. Their four chip colours are spelled out in
 * {@link BUILTIN_PREVIEW} instead, copied from `packages/ui/src/themes/*.css`; the accent is taken
 * from the package's own table when it has one.
 */
import { Text, THEME_IDS, THEME_OWN_ACCENTS } from "@adelie/ui";
import { S } from "../../lib/strings";
import { localizedText } from "../chat/skill-use";
import type { ImportedThemeView } from "../../state/external-themes";

/** The four colours a card paints its chip with. */
export interface ThemePreview {
  readonly canvas: string;
  readonly surface: string;
  readonly fg: string;
  readonly accent: string;
}

/** What a theme paints in each mode; the picker shows the one the page is drawn in. */
export interface ThemePreviewPair {
  readonly light: ThemePreview;
  readonly dark: ThemePreview;
}

/**
 * The shipped themes' chip colours, from `packages/ui/src/themes/*.css` (light, then dark). The
 * accent is the package's own where {@link THEME_OWN_ACCENTS} lists it.
 */
const BUILTIN_PREVIEW: Readonly<Record<string, ThemePreviewPair>> = {
  modern: {
    light: { canvas: "#fafafa", surface: "#ffffff", fg: "#232527", accent: "#006838" },
    dark: { canvas: "#1b1c1e", surface: "#232426", fg: "#e6e6e6", accent: "#4aa45c" },
  },
  github: {
    light: { canvas: "#ffffff", surface: "#ffffff", fg: "#171717", accent: "#171717" },
    dark: { canvas: "#0a0a0a", surface: "#1c1c1c", fg: "#ededed", accent: "#f5f5f5" },
  },
  geek: {
    light: { canvas: "#fbfafa", surface: "#fbfafa", fg: "#1d1d1f", accent: "#1d1d1f" },
    dark: { canvas: "#131010", surface: "#1a1717", fg: "#ededed", accent: "#f4f2f2" },
  },
};

/** What a card shows: the id, the words, whether a file brought it, and its colours. */
export interface ThemeChoice {
  readonly id: string;
  readonly label: string;
  readonly imported: boolean;
  readonly preview: ThemePreviewPair;
}

/** The chip for one mode: the canvas, a surface bar, a line of ink and the accent beside it. */
function ThemeChip({ preview }: { preview: ThemePreview }) {
  return (
    <span
      aria-hidden
      className="block overflow-hidden rounded-[var(--ui-radius-sm)] border border-line/70"
      style={{ background: preview.canvas, height: "2.75rem" }}
    >
      <span
        className="mt-1.5 ml-1.5 block"
        style={{
          background: preview.surface,
          border: `1px solid ${preview.fg}1f`,
          borderRadius: "0.25rem",
          height: "0.75rem",
        }}
      />
      <span className="mt-1 ml-1.5 flex items-center gap-1">
        <span
          className="block"
          style={{
            background: preview.fg,
            borderRadius: "9999px",
            height: "0.1875rem",
            opacity: 0.5,
            width: "2.25rem",
          }}
        />
        <span
          className="block"
          style={{
            background: preview.accent,
            borderRadius: "9999px",
            height: "0.1875rem",
            width: "0.75rem",
          }}
        />
      </span>
    </span>
  );
}

function ThemeCard({
  choice,
  selected,
  dark,
  onPick,
}: {
  choice: ThemeChoice;
  selected: boolean;
  dark: boolean;
  onPick: () => void;
}) {
  const preview = dark ? choice.preview.dark : choice.preview.light;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={`flex flex-col gap-1.5 rounded-[var(--ui-radius-md)] border p-1.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
        selected
          ? "border-accent bg-accent-muted"
          : "border-line bg-surface hover:border-line-emphasis hover:bg-surface-muted"
      }`}
      style={selected ? { boxShadow: `inset 0 0 0 1px ${preview.accent}` } : undefined}
    >
      <ThemeChip preview={preview} />
      <span className="flex min-w-0 items-center gap-1 px-0.5">
        <span className={`truncate text-sm ${selected ? "text-fg-emphasis" : "text-fg"}`}>
          {choice.label}
        </span>
        {selected && (
          <span aria-hidden className="ml-auto shrink-0 text-xs text-accent">
            ✓
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The grid: the shipped themes first, then the ones files brought, each group only when it has
 * anything in it. Four across on a wide settings page, two on a narrow one; the band scrolls
 * rather than growing the page when a folder holds a dozen themes.
 */
export function ThemePicker({
  imported,
  value,
  onChange,
  dark,
  locale,
}: {
  /** What this installation imported, in the server's order; painted with their own colours. */
  imported: readonly ImportedThemeView[];
  value: string;
  onChange: (id: string) => void;
  dark: boolean;
  locale: "zh" | "en";
}) {
  const builtin: ThemeChoice[] = THEME_IDS.map((id) => {
    const preview = BUILTIN_PREVIEW[id] ?? BUILTIN_PREVIEW.modern!;
    const own = THEME_OWN_ACCENTS[id];
    return {
      id,
      label: S.settings.themeNames[id],
      imported: false,
      preview:
        own === undefined
          ? preview
          : {
              light: { ...preview.light, accent: own.light },
              dark: { ...preview.dark, accent: own.dark },
            },
    };
  });
  const files: ThemeChoice[] = imported.map((theme) => ({
    id: theme.id,
    label: localizedText(locale, theme.name, theme.nameZh),
    imported: true,
    preview: theme.preview,
  }));
  // A stored id nothing provides keeps its place, so the row never quietly claims the default
  // theme is what is chosen while the root carries something else.
  const orphan: ThemeChoice | null =
    builtin.some((choice) => choice.id === value) || files.some((choice) => choice.id === value)
      ? null
      : {
          id: value,
          label: value,
          imported: true,
          preview: builtin[0]!.preview,
        };
  return (
    <div className="mt-3 flex max-h-[15rem] flex-col gap-2 overflow-y-auto pr-1">
      <ThemeGroup
        label={S.settings.themeBuiltin}
        choices={builtin}
        value={value}
        dark={dark}
        onChange={onChange}
      />
      {(files.length > 0 || orphan !== null) && (
        <ThemeGroup
          label={S.settings.themeImportedGroup}
          choices={orphan === null ? files : [...files, orphan]}
          value={value}
          dark={dark}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function ThemeGroup({
  label,
  choices,
  value,
  dark,
  onChange,
}: {
  label: string;
  choices: readonly ThemeChoice[];
  value: string;
  dark: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <Text variant="eyebrow" className="mb-1">
        {label}
      </Text>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
        {choices.map((choice) => (
          <ThemeCard
            key={choice.id}
            choice={choice}
            selected={choice.id === value}
            dark={dark}
            onPick={() => onChange(choice.id)}
          />
        ))}
      </div>
    </div>
  );
}
