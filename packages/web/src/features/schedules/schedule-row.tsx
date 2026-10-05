/**
 * One scheduled task's row, shared by the two surfaces that list tasks: the chat dock's panel
 * (the tasks bound to the conversation on screen) and the scheduled-tasks page (every Agent's
 * tasks in the Project). Both list the same thing, so a task has to read the same in both —
 * state mark, name and its human schedule line, the queue badge, the enable switch and the
 * overflow menu (edit / delete) — and a second copy of that markup is how the two would drift
 * apart the day one of them gains a state.
 *
 * The actions are the caller's: the panel and the page run the same three writes, but the page
 * has to name the Agent holding the file, so each one passes its own callbacks.
 */
import { useState } from "react";
import type { ScheduleItem } from "@lmliheng/penguin-server/api";
import {
  Badge,
  Dropdown,
  GlyphIcon,
  ICONS,
  ICON_SIZE,
  Menu,
  MenuItem,
  Switch,
} from "@lmliheng/penguin-ui";
import { S } from "../../lib/strings";
import { toneInk } from "../../lib/tone";
import { useLocale } from "../../state/locale";
import { describeSchedule } from "./schedule-describe";
import { scheduleGlyph } from "./schedule-panel-state";

/** The state marks: a filled play for an armed task, pause bars, a check for the settled states. */
const PLAY_ICON = "M7 4l13 8-13 8z";
const PAUSE_ICON = "M8 4v16M16 4v16";
const CHECK_ICON = "M5 12l4 4L19 6";

/** The row's leading state glyph; an invalid file wears the info circle in the danger tone, its reason in the tooltip. */
function StateGlyph({ item }: { item: ScheduleItem }) {
  const glyph = scheduleGlyph(item.status);
  const name = S.schedule.statusNames[item.status] ?? item.status;
  const tone =
    glyph === "play" ? toneInk.success : glyph === "alert" ? toneInk.danger : toneInk.muted;
  const d =
    glyph === "play"
      ? PLAY_ICON
      : glyph === "pause"
        ? PAUSE_ICON
        : glyph === "check"
          ? CHECK_ICON
          : ICONS.info;
  return (
    <span className={`shrink-0 ${tone}`} data-tooltip={item.invalidReason ?? name}>
      <GlyphIcon d={d} size={ICON_SIZE.rowLead} filled={glyph === "play"} />
      <span className="sr-only">{name}</span>
    </span>
  );
}

/** A row's overflow menu: edit, and delete in the destructive treatment (small Menu rows). */
function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const item = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <Dropdown
      open={open}
      setOpen={setOpen}
      portal={{ direction: "down", align: "right" }}
      menuClass="w-32"
      button={
        <button
          type="button"
          data-tooltip={S.schedule.rowActions}
          aria-label={S.schedule.rowActions}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <GlyphIcon d={ICONS.ellipsis} size={ICON_SIZE.rowLead} filled />
        </button>
      }
    >
      <Menu density="sm">
        <MenuItem glyph={ICONS.pencil} label={S.common.edit} onSelect={item(onEdit)} />
        {/* The glyph inherits the row's red. */}
        <MenuItem glyph={ICONS.trash} label={S.common.delete} danger onSelect={item(onDelete)} />
      </Menu>
    </Dropdown>
  );
}

export function ScheduleRow({
  item,
  /** Whether this account may write: the switch and the menu are owner-only, and a member sees the row read-only. */
  owner,
  /** A write on this list is in flight: every control on the row waits for it. */
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ScheduleItem;
  owner: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { locale } = useLocale();
  const line = describeSchedule(item, locale);
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-800/60">
      <StateGlyph item={item} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="truncate text-sm text-gray-800 dark:text-gray-100"
            // The name leads the tooltip, not just the prompt: a task name is a file name and
            // truncates in a narrow column, and the row would otherwise be the one surface that
            // cannot show it in full.
            data-tooltip={`${item.name}\n${item.prompt}`}
            data-tooltip-content="text"
          >
            {item.name}
          </span>
          {item.queued && <Badge variant="solid">{S.schedule.queued}</Badge>}
        </div>
        <div
          className="truncate text-xs text-gray-500 dark:text-gray-400"
          data-tooltip={item.invalidReason ?? line}
          data-tooltip-content="text"
        >
          {line}
        </div>
      </div>
      {owner && (
        <>
          <Switch
            checked={item.enabled}
            disabled={busy}
            aria-label={item.enabled ? S.schedule.disable : S.schedule.enable}
            onChange={onToggle}
          />
          <RowMenu onEdit={onEdit} onDelete={onDelete} />
        </>
      )}
    </div>
  );
}
