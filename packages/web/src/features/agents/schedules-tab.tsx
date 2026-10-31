/**
 * Agent settings page "Schedule" tab: a table view over
 * agent_state/schedule/*.toml (status badge derived from run state; "next / last
 * fired" shown as two stacked rows) with the split create button at its head —
 * "Create with AI" describes the task to the Project's default agent in a new
 * conversation (AiCreateModal), "Set up manually" opens the shared form
 * (features/schedules/schedule-form-modal.tsx, also the panel's and the row menu's) —
 * and the everyday-schedule suggestions in place of an empty table.
 * Wrapping is controlled per column: compact cells (status, period, fire times,
 * queue, actions) are nowrap, long text cells (name, target) truncate with the
 * full value on hover, and the existing overflow-x-auto container takes over
 * below the table's min width.
 * Readable by any member; toggle/edit/delete are owner-only — PUT has whole-file
 * replace semantics, so toggling also resends every field and only flips `enabled`.
 * A refused flip draws its reason under that row's status badge (`ToggleRefusal`, the same
 * rule the shared row's switch uses); the other row actions report via toast or the dialog
 * that asked for them.
 *
 * Prompt-injection controls (usePromptInjection): the schedules.enabled switch, the
 * {{SCHEDULES}}-placeholder alert and the editable schedules.prompt section, mirroring the
 * Memory tab — owner-only, like the table edits. The prompt teaches the model to manage
 * task files itself; the toggle never stops the server from firing configured tasks.
 */
import { useCallback, useEffect, useState } from "react";
import type { ScheduleItem, SchedulesResponse, ScheduleStatus } from "@adelie/server/api";
import {
  Badge,
  Button,
  ConfirmModal,
  HelpFold,
  SettingsEmpty,
  SkeletonList,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  toastSuccess,
} from "@adelie/ui";
import type { BadgeStyle } from "@adelie/ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { formatDateTime } from "../../lib/format";
import { useProject } from "../../state/project";
import { AiCreateModal } from "../ai-create";
import { AiCreateButtons } from "../ai-create/ai-create-buttons";
import { ScheduleFormModal } from "../schedules/schedule-form-modal";
import { ScheduleSuggestions, scheduleExamples } from "../schedules/schedule-suggestions";
import { scheduleRefusalFor } from "../schedules/schedule-toggle";
import type { ScheduleToggleRefusal } from "../schedules/schedule-toggle";
import { toggleBody } from "../schedules/schedule-upsert";
import { toneInk } from "../../lib/tone";
import { usePromptInjection } from "./prompt-injection-controls";

/** Display status → badge. A finished one-off is settled: a neutral tag, solid so it still reads. */
const STATUS_BADGE: Record<ScheduleStatus, BadgeStyle> = {
  active: { tone: "success" },
  disabled: { tone: "neutral" },
  expired: { tone: "attention" },
  done: { tone: "neutral", variant: "solid" },
  missed: { tone: "attention" },
  invalid: { tone: "danger" },
};

/**
 * The sentence under a row's status badge for a flip of its 启用 / 停用 the server refused —
 * `null` for every other row, and for a flip that has not been refused (the host picks the row
 * with `scheduleRefusalFor`). A `nowrap` cell still wraps this one block (`whitespace-normal`),
 * and `line-clamp-2` keeps a long server sentence from stretching the column; the whole text is
 * on hover, the way the shared row's own line carries it.
 */
function ToggleRefusal({ refusal }: { refusal: string | null }) {
  if (refusal === null) return null;
  return (
    <p
      role="alert"
      data-tooltip={S.common.refused(refusal)}
      data-tooltip-content="text"
      className={`mt-1 line-clamp-2 max-w-56 whitespace-normal break-words text-xs ${toneInk.danger}`}
    >
      {S.common.refused(refusal)}
    </p>
  );
}

export function SchedulesTab({
  agentId,
  onConfigChanged,
}: {
  agentId: string;
  /** Config writes (toggle / prompt / placeholder insert) happen here directly, so the settings page must refetch its own copy — otherwise a later Prompt-tab save from stale data would silently revert them. */
  onConfigChanged?: () => void;
}) {
  const { currentProject, agents, reloadAgents } = useProject();
  const projectId = currentProject?.projectId ?? null;
  const isOwner = currentProject?.role === "owner";
  // Prompt-injection controls follow the tab's existing gate: owner-only edits.
  const { applyConfig, toggleCard, alertStrip, promptSection } = usePromptInjection({
    agentId,
    feature: "schedules",
    strings: S.schedule.injection,
    canEdit: isOwner,
    onConfigChanged,
  });

  const [data, setData] = useState<SchedulesResponse | null>(null);
  // Tab-level error is only the initial list load failure; a refused flip keeps its reason under
  // that row, the other row actions report via toast.
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Form dialog: non-null means open (editing that row, or null for a new task).
  const [form, setForm] = useState<{ editing: ScheduleItem | null } | null>(null);
  // AI dialog: non-null means open, seeded with a suggestion's prompt or nothing.
  const [ai, setAi] = useState<{ initial: string } | null>(null);
  // Name of the task pending deletion confirmation (non-null shows the confirm modal).
  const [deleting, setDeleting] = useState<string | null>(null);
  // The server's words for a delete it refused, drawn inside that same confirmation: the toast
  // that used to carry them dismissed itself while the retry was still the next thing to do.
  const [deleteRefusal, setDeleteRefusal] = useState<string | null>(null);
  // The server's words for a flip of a row's 启用 / 停用 it refused. That button writes nothing
  // optimistically (the row keeps the state the server has), so a refusal leaves no trace at all —
  // and the reason was a toast, gone six seconds later, beside a button that had not moved. Same
  // rule as the shared row's switch about which row may draw it (`scheduleRefusalFor`), since a
  // task is named the same way here: this tab lists one Agent's tasks, but the row the sentence
  // belongs to is still decided by the rule the other two surfaces use.
  const [toggleRefusal, setToggleRefusal] = useState<ScheduleToggleRefusal | null>(null);

  const load = useCallback(async () => {
    if (!projectId || !agentId) return;
    setData(null);
    setError(null);
    try {
      // The injection controls' state loads in parallel with the tab's own table.
      const [schedules, configView] = await Promise.all([
        api.listSchedules(projectId, agentId),
        api.getAgentConfig(projectId, agentId),
      ]);
      setData(schedules);
      applyConfig(configView.config);
    } catch (e) {
      setError(apiErrorText(e));
    }
  }, [projectId, agentId, applyConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  /** After a create, update or delete: the table, and the agent card's schedule count. */
  const changed = () => {
    void load();
    void reloadAgents();
  };

  /** Toggle: whole-file-replace semantics — resend original fields, only flip enabled. */
  const toggle = async (item: ScheduleItem) => {
    if (!projectId) return;
    setBusy(true);
    // This flip's answer replaces the last one's: the line belongs to the attempt, not the row.
    setToggleRefusal(null);
    try {
      await api.updateSchedule(projectId, agentId, item.name, toggleBody(item, !item.enabled));
      toastSuccess(item.enabled ? S.schedule.toastDisabled : S.schedule.toastEnabled);
      await load();
    } catch (e) {
      setToggleRefusal({ agentId, name: item.name, text: apiErrorText(e) });
    } finally {
      setBusy(false);
    }
  };

  /** Confirm modal's "Confirm": closes the modal once the deletion landed; a refused one stays with the server's words. */
  const confirmRemove = async () => {
    if (!projectId || deleting === null) return;
    setBusy(true);
    try {
      await api.deleteSchedule(projectId, agentId, deleting);
      if (form?.editing?.name === deleting) setForm(null);
      changed();
      setDeleting(null);
    } catch (e) {
      setDeleteRefusal(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) return null;

  const schedules = data?.schedules ?? [];
  const invalidFiles = data?.invalidFiles ?? [];
  const openAi = (initial: string) => setAi({ initial });

  return (
    <div className="space-y-4">
      {/* Tab-level description: no title in the panel to anchor a "?" to (see help-fold.tsx). */}
      <HelpFold label={S.agent.tabSchedules}>
        {S.schedule.desc}
        {!isOwner && <span className="mt-1.5 block">{S.schedule.readOnlyHint}</span>}
      </HelpFold>

      {toggleCard}
      {alertStrip}

      {/* Create entry point at the head of the table, right-aligned (the skills tab's slot): the
          two buttons offer the AI path and the form side by side; a member, who cannot write
          files here, gets the AI button alone — asking the agent is a message, not a write. */}
      <div className="flex justify-end">
        <AiCreateButtons
          size="sm"
          onAi={() => openAi("")}
          {...(isOwner ? { onManual: () => setForm({ editing: null }) } : {})}
        />
      </div>

      {data === null ? (
        <SkeletonList rows={4} />
      ) : schedules.length === 0 ? (
        <div className="space-y-4">
          <SettingsEmpty>{S.schedule.empty}</SettingsEmpty>
          {/* Nothing configured yet: the everyday schedules, each opening the AI dialog with its prompt filled in. */}
          <ScheduleSuggestions mode="agent" onPick={openAi} />
        </div>
      ) : (
        <Table tableClassName="min-w-[720px]">
          <TableHead>
            <TableHeaderCell>{S.common.name}</TableHeaderCell>
            <TableHeaderCell>{S.schedule.colStatus}</TableHeaderCell>
            <TableHeaderCell>{S.schedule.colPeriod}</TableHeaderCell>
            <TableHeaderCell>{S.schedule.colTarget}</TableHeaderCell>
            <TableHeaderCell>{S.schedule.colFireTimes}</TableHeaderCell>
            <TableHeaderCell>{S.schedule.colQueued}</TableHeaderCell>
            {isOwner && <TableHeaderCell />}
          </TableHead>
          <TableBody>
            {schedules.map((item) => (
              <TableRow key={item.name}>
                {/* Long text columns truncate with the full value on hover instead of wrapping. */}
                <TableCell
                  className="max-w-40 truncate font-mono text-xs"
                  data-tooltip={item.name}
                  data-tooltip-content="code"
                >
                  {item.name}
                </TableCell>
                <TableCell nowrap>
                  {/* invalid reason is folded into the hover title. */}
                  <span data-tooltip={item.invalidReason} data-tooltip-extra>
                    <Badge {...STATUS_BADGE[item.status]}>
                      {S.schedule.statusNames[item.status] ?? item.status}
                    </Badge>
                  </span>
                  {/* Under the badge the button would have moved: the same alert shape (and the
                      same shared lead-in) the shared row, the dialogs and the other switches use
                      for a refused write. */}
                  <ToggleRefusal
                    refusal={scheduleRefusalFor(toggleRefusal, { agentId, name: item.name })}
                  />
                </TableCell>
                <TableCell nowrap className="text-xs text-gray-500 dark:text-gray-400">
                  {item.period !== undefined ? (
                    <span className="font-mono">{item.period}</span>
                  ) : (
                    S.schedule.once
                  )}
                </TableCell>
                <TableCell
                  className="max-w-36 truncate text-xs text-gray-500 dark:text-gray-400"
                  data-tooltip={item.sessionId}
                  data-tooltip-content="text"
                >
                  {item.sessionId !== undefined ? (
                    <span className="font-mono">{item.sessionId}</span>
                  ) : (
                    S.schedule.newSession
                  )}
                </TableCell>
                {/* Deliberate two-line stack — top: next fire time; bottom: last fired time
                    (both show — when absent); nowrap keeps each line whole. */}
                <TableCell nowrap className="text-xs">
                  <span className="block text-gray-600 dark:text-gray-300">
                    {item.nextFireAt ? formatDateTime(item.nextFireAt) : "—"}
                  </span>
                  <span className="block text-gray-400 dark:text-gray-500">
                    {item.lastFiredAt ? formatDateTime(item.lastFiredAt) : "—"}
                  </span>
                </TableCell>
                <TableCell nowrap>
                  {item.queued && <Badge variant="solid">{S.schedule.queued}</Badge>}
                </TableCell>
                {isOwner && (
                  <TableCell align="right" nowrap>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void toggle(item)}
                    >
                      {item.enabled ? S.schedule.disable : S.schedule.enable}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setForm({ editing: item })}
                    >
                      {S.common.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setDeleting(item.name);
                        setDeleteRefusal(null);
                      }}
                    >
                      {S.common.delete}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {invalidFiles.length > 0 && (
        <div className="text-xs text-red-600 dark:text-red-400">
          <p className="font-medium">{S.schedule.invalidFiles}</p>
          <ul className="mt-0.5 space-y-1 font-mono">
            {invalidFiles.map((f) => (
              <li key={f.name}>
                {f.name}: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {promptSection}

      {/* Shared create/edit form (the inline "Edit" buttons reuse it with the row prefilled). */}
      <ScheduleFormModal
        open={form !== null}
        agentId={agentId}
        editing={form?.editing ?? null}
        onClose={() => setForm(null)}
        onSaved={changed}
      />

      {/* "Create with AI": the task is described to the Project's default agent in a new
          conversation, with the tail naming this agent as the one the task is created for. */}
      <AiCreateModal
        open={ai !== null}
        onClose={() => setAi(null)}
        title={S.schedule.aiCreateTitle}
        description={S.schedule.aiCreateDesc}
        initialValue={ai?.initial ?? ""}
        examples={scheduleExamples("agent")}
        tail={S.schedule.aiCreateTail(agentId)}
        agents={agents}
      />

      {/* Delete confirmation (shared ConfirmModal, same pattern as Vault / Agent deletion). */}
      <ConfirmModal
        open={deleting !== null}
        title={S.schedule.deleteTitle}
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmRemove()}
        confirmLabel={S.common.confirm}
        cancelLabel={S.common.cancel}
        refusal={deleteRefusal === null ? undefined : S.common.refused(deleteRefusal)}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {deleting !== null ? S.schedule.deleteConfirm(deleting) : ""}
        </p>
      </ConfirmModal>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
