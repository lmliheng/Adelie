/**
 * The header row of the draft screen's folder of saved prompts: a disclosure that toggles. It
 * was a tab once — open it and it stayed open — and the row's own chevron then promised a
 * collapse it did not have, so the click now flips the state it shows.
 */
import { Chevron, ICON_SIZE } from "@lmliheng/penguin-ui";

export function FolderRow({
  open,
  glyph,
  label,
  count,
  onToggle,
}: {
  open: boolean;
  /** 24x24 path for the folder's own mark — what the eye scans to pick a category. */
  glyph: string;
  label: string;
  /** Rows inside the folder, shown right of the name — a bare count, or `used/limit` where one applies. */
  count: number | string;
  /** Flip the folder: opening shows the body below, closing puts it away again. */
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors duration-150 ${
        open ? "bg-gray-100 dark:bg-gray-800/70" : "hover:bg-gray-100 dark:hover:bg-gray-800/70"
      }`}
    >
      <span className="shrink-0 text-brand-500 dark:text-brand-400">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d={glyph} />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </span>
      <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{count}</span>
      <Chevron open={open} size={ICON_SIZE.chevron} className="text-gray-400" />
    </button>
  );
}

/**
 * The class string of one shortcut row — shared with the header above so the two read as one
 * block. Layout (flex, width) is the caller's, since a row also carries its own actions.
 */
export const folderRowClass =
  "rounded-md px-2 py-1.5 text-left text-sm text-gray-600 transition-colors duration-150 " +
  "hover:bg-gray-100 hover:text-gray-900 disabled:cursor-default disabled:opacity-60 " +
  "disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-gray-800/70 dark:hover:text-gray-200";
