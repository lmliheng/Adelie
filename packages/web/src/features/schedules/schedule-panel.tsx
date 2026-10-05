/**
 * The chat dock's scheduled-tasks panel: the tasks bound to the conversation on screen (the
 * Project's schedules filtered to this Session — new-Session tasks belong to the agent and live
 * on its settings tab), searchable and filtered by state, each row with its human schedule
 * line, an enable switch and an overflow menu (edit / delete); a suggestions list of everyday
 * schedules; and the two create buttons in the header — "Create with AI" composes the request
 * and prefills THIS conversation's composer with it (ScheduleAiModal), "Create manually" opens
 * the shared form pinned to this Session. This panel is the only place a task bound to a
 * conversation is created.
 *
 * The list is the shared store's (schedule-store.ts), narrowed to this Session, so the chat
 * toolbar's alarm-clock mark counts exactly what is listed here. This panel adds the one
 * refresh trigger the store cannot know about: a slow poll while the tab is actually on screen.
 *
 * Readable by any member; the switch, edit and delete are owner-only, like the settings tab,
 * while the AI path stays open to everyone — asking the agent is a message, not a write.
 */
import { useEffect, useState } from "react";
import type { ProjectScheduleItem, SessionInfo } from "@lmliheng/penguin-server/api";
import {
  ConfirmModal,
  SearchInput,
  Segmented,
  SettingsEmpty,
  SkeletonList,
  toastError,
  toastSuccess,
} from "@lmliheng/penguin-ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { useProject } from "../../state/project";
import { AiCreateButtons } from "../ai-create/ai-create-buttons";
import { ScheduleAiModal } from "./schedule-ai-modal";
import { ScheduleFormModal } from "./schedule-form-modal";
import { ScheduleRow } from "./schedule-row";
import {
  SCHEDULE_FILTERS,
  filterSchedules,
  scheduleFilterLabels,
  sessionSchedules,
} from "./schedule-panel-state";
import type { ScheduleFilter } from "./schedule-panel-state";
import { refreshSchedules, useProjectSchedules } from "./schedule-store";
import { ScheduleSuggestions } from "./schedule-suggestions";
import { toggleBody } from "./schedule-upsert";

/** How often the list refetches while on screen — about the server's own re-read cadence for the schedule directory. */
const REFRESH_MS = 30_000;

export interface SchedulePanelProps {
  session: SessionInfo;
  /** Whether this tab is the one on screen (the dock keeps hidden tabs mounted): a hidden tab does not poll. */
  active: boolean;
  /** Writes the AI dialog's prompt into this conversation's composer (see ScheduleAiModal). */
  onPrefillComposer: (text: string) => void;
}

export function SchedulePanel({ session, active, onPrefillComposer }: SchedulePanelProps) {
  const { currentProject, agents, reloadAgents } = useProject();
  const projectId = currentProject?.projectId ?? null;
  const isOwner = currentProject?.role === "owner";
  // The shared store's list, narrowed to this conversation; only the first load's failure shows
  // in place, and row actions report via toast.
  const { items: projectItems, error } = useProjectSchedules(projectId, session.sessionId);
  const items = projectItems === null ? null : sessionSchedules(projectItems, session.sessionId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  const [busy, setBusy] = useState(false);
  // Form dialog: non-null means open (editing a row, or null for a new task pinned to this Session).
  const [form, setForm] = useState<{ editing: ProjectScheduleItem | null } | null>(null);
  // The task pending deletion confirmation, named by its file: the agent whose directory holds it
  // and the file name, which is what the delete call takes.
  const [deleting, setDeleting] = useState<{ agentId: string; name: string } | null>(null);
  // AI dialog: non-null means open, seeded with a suggestion's prompt or nothing.
  const [ai, setAi] = useState<{ initial: string } | null>(null);

  // On coming to the front, and on a timer while it stays there. Focus and visibility are the
  // store's own business (it refreshes for the session rows' marks too); a hidden tab adds no
  // poll. The refresh re-reads the whole Project, which is the one list both surfaces share, so
  // the poll keeps the rows as fresh as this panel.
  useEffect(() => {
    if (!active) return;
    void refreshSchedules(projectId);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshSchedules(projectId);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [active, projectId]);

  /** After a create or delete: the list, and the agent card's schedule count. */
  const changed = () => {
    void refreshSchedules(projectId);
    void reloadAgents();
  };

  /**
   * Toggle: whole-file-replace semantics — resend original fields, only flip enabled. The write
   * names the agent whose schedule directory holds the file, which the Project-wide list stamps
   * on every task; the conversation's own agent is only the right answer for tasks created here.
   */
  const toggle = async (item: ProjectScheduleItem) => {
    if (!projectId) return;
    setBusy(true);
    try {
      await api.updateSchedule(projectId, item.agentId, item.name, toggleBody(item, !item.enabled));
      toastSuccess(item.enabled ? S.schedule.toastDisabled : S.schedule.toastEnabled);
      await refreshSchedules(projectId);
    } catch (e) {
      toastError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!projectId || deleting === null) return;
    setBusy(true);
    try {
      await api.deleteSchedule(projectId, deleting.agentId, deleting.name);
      // The form may be sitting open on the very task just deleted (the row menu offers both).
      const editing = form?.editing;
      if (editing?.agentId === deleting.agentId && editing?.name === deleting.name) setForm(null);
      changed();
    } catch (e) {
      toastError(apiErrorText(e));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  const openAi = (initial: string) => setAi({ initial });
  const visible = items === null ? [] : filterSchedules(items, filter, query);
  const searching = query.trim() !== "";
  const filterLabels = scheduleFilterLabels();

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-3">
        {/* The two create paths, on a row of their own under the title rather than beside it.
            This panel lives in a dock whose width the user drags, and a title block that may
            shrink to nothing (min-w-0, which the subtitle needs) can never push a neighbour on
            to a second line — so a side-by-side header squeezes the buttons instead of wrapping
            them, and at the right dock's usual width they clip. A row of their own costs one
            line at every width and clips at none. */}
        <div className="space-y-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {S.schedule.panelTitle}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {S.schedule.panelSubtitle}
            </p>
          </div>
          {/* The AI half is open to every member — asking the agent for a task is a message,
              not a write — while the form writes files and stays with the owner. */}
          <AiCreateButtons
            size="sm"
            onAi={() => openAi("")}
            {...(isOwner ? { onManual: () => setForm({ editing: null }) } : {})}
          />
        </div>

        <SearchInput
          size="sm"
          value={query}
          placeholder={S.schedule.panelSearchPlaceholder}
          aria-label={S.schedule.panelSearchPlaceholder}
          onChange={setQuery}
        />
        <Segmented
          cols={4}
          options={SCHEDULE_FILTERS.map((value) => ({ value, label: filterLabels[value] }))}
          value={filter}
          onChange={setFilter}
        />

        {items === null ? (
          error !== null ? (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <SkeletonList rows={3} />
          )
        ) : items.length === 0 ? (
          <SettingsEmpty>{S.schedule.panelEmpty}</SettingsEmpty>
        ) : visible.length === 0 ? (
          <SettingsEmpty>{S.schedule.panelNoMatch}</SettingsEmpty>
        ) : (
          <ul className="space-y-1">
            {visible.map((item) => (
              <li key={item.name}>
                <ScheduleRow
                  item={item}
                  owner={isOwner}
                  busy={busy}
                  onToggle={() => void toggle(item)}
                  onEdit={() => setForm({ editing: item })}
                  onDelete={() => setDeleting({ agentId: item.agentId, name: item.name })}
                />
              </li>
            ))}
          </ul>
        )}

        {!searching && <ScheduleSuggestions mode="session" onPick={openAi} />}
      </div>

      <ScheduleFormModal
        open={form !== null}
        // Editing writes back to the file's own agent; creating pins the new task to this
        // conversation, which is this agent's.
        agentId={form?.editing?.agentId ?? session.agentId}
        editing={form?.editing ?? null}
        lockedSessionId={session.sessionId}
        onClose={() => setForm(null)}
        onSaved={changed}
      />

      <ScheduleAiModal
        open={ai !== null}
        initialValue={ai?.initial ?? ""}
        agents={agents}
        agentId={session.agentId}
        onPrefill={onPrefillComposer}
        onClose={() => setAi(null)}
      />

      <ConfirmModal
        open={deleting !== null}
        title={S.schedule.deleteTitle}
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmRemove()}
        confirmLabel={S.common.confirm}
        cancelLabel={S.common.cancel}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {deleting !== null ? S.schedule.deleteConfirm(deleting.name) : ""}
        </p>
      </ConfirmModal>
    </div>
  );
}
