/**
 * Scheduled-tasks page: every Agent's tasks in the Project in one place, so the Project can be
 * seen as a whole instead of Agent by Agent. The other two surfaces stay as they are and answer
 * different questions — the Agent settings tab lists ONE Agent's tasks in a table (with the
 * prompt-injection controls beside them), and the chat dock's panel lists the tasks of the
 * conversation on screen. This is the one that answers "what is scheduled in this Project".
 *
 * The page has two scopes, and the difference between them is deliberate: 「本项目」 is the
 * editable Project-wide list, and 「全部项目」 is a read-only overview over every Project this
 * account may reach (GET /api/schedules) — every Project's tasks in one look, each heading
 * offering the jump to that Project. Creation stays in the Project scope, because a task file
 * lives in one Agent's directory of one Project: the overview is where a task is *found*, and
 * the Project page is where it is created.
 *
 * Reached from the account menu rather than the sidebar's nav: it is a Project-wide inventory
 * looked at now and then, not a workspace the user lives in, and the sidebar's top group is for
 * the latter.
 *
 * The list is the shared store's (schedule-store.ts), the same Project-wide answer the session
 * list's marks and the dock's panel read, so the three can never disagree. It comes back flat,
 * with the owning Agent on every task, and is drawn GROUPED by that Agent: a task file lives in
 * one Agent's agent_state/schedule/, and the Agent is what says where its workspace, model and
 * Session picker point — so a flat list of same-named tasks from different Agents would read as
 * a pile of duplicates. The filter chips and the search box narrow the rows inside the groups.
 *
 * Creating picks the Agent first (the header's button opens one row per Agent): the form's Agent
 * is fixed for the task's whole life — the file's directory IS the owner — so the choice cannot
 * be left to whatever the app happens to have selected. Editing and deleting always name the
 * file's own Agent, which is where the row's task came from.
 *
 * The files the server could not parse are listed at the end, which is the one thing this page
 * shows that the dock's panel does not: an unparseable file is invisible in every listing (the
 * server skips it), so without this the only way to learn a task never got scheduled would be
 * the server log. The overview lists them per Project for the same reason.
 *
 * Readable by any member; the switch, the menu and the create button are owner-only — a schedule
 * writes files and sends prompts, exactly as in the settings tab — and the cross-Project overview
 * has none of them: it reads and jumps, and changes nothing anywhere.
 */
import { useEffect, useState } from "react";
import type {
  AllProjectSchedulesResponse,
  ProjectScheduleItem,
} from "@lmliheng/penguin-server/api";
import {
  AgentAvatar,
  Button,
  ConfirmModal,
  Dropdown,
  Menu,
  MenuItem,
  PageFrame,
  PageHeader,
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
import { useDocumentTitle } from "../../lib/use-document-title";
import { agentDisplayName, useProject } from "../../state/project";
import { crossProjectGroups, groupSchedulesByAgent } from "./schedule-page-state";
import { SCHEDULE_FILTERS, filterSchedules, scheduleFilterLabels } from "./schedule-panel-state";
import type { ScheduleFilter } from "./schedule-panel-state";
import { ScheduleFormModal } from "./schedule-form-modal";
import { ScheduleRow } from "./schedule-row";
import { refreshSchedules, useProjectSchedules } from "./schedule-store";
import { toggleBody } from "./schedule-upsert";

/**
 * The `refreshKey` of the store hook: a constant, because this page is scoped to nothing but the
 * Project. The panel passes the Session on screen there; here nothing finer than the Project can
 * change, so the list is read on mount and re-read on the store's own triggers (focus, schedule
 * events, every write this page makes).
 */
const PAGE_REFRESH_KEY = "schedules-page";

/** The page's two scopes: this Project's editable list, or the read-only overview over every Project. */
type Scope = "project" | "all";

const SCOPES: readonly Scope[] = ["project", "all"];

/**
 * The overview's rows are read-only (`ScheduleRow` with `owner = false` draws no switch and no
 * menu), but its callbacks are still required: nothing on the row can reach them, and a shared
 * no-op is what says so at the call site rather than six inline closures.
 */
const noop = (): void => {};

export function SchedulesPage() {
  useDocumentTitle(S.schedule.pageTitle);
  const { currentProject, agents, reloadAgents, setCurrentProjectId } = useProject();
  const projectId = currentProject?.projectId ?? null;
  const isOwner = currentProject?.role === "owner";
  const { items, invalidFiles, error } = useProjectSchedules(projectId, PAGE_REFRESH_KEY);
  const [scope, setScope] = useState<Scope>("project");
  // The cross-Project answer, fetched while the overview is on screen. It is not put in the
  // store the other surfaces share: nothing else shows another Project's tasks, and a page
  // that has never been opened should cost no request.
  const [allProjects, setAllProjects] = useState<AllProjectSchedulesResponse | null>(null);
  const [allError, setAllError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  // A write is in flight: every control on the list waits for it.
  const [busy, setBusy] = useState(false);
  // Form dialog: non-null means open, carrying the Agent whose directory the task lives in (the
  // one being edited, or the one just picked for a new task).
  const [form, setForm] = useState<{
    agentId: string;
    editing: ProjectScheduleItem | null;
  } | null>(null);
  // The task pending deletion confirmation, named by its file: the Agent whose directory holds it
  // and the file name, which is what the delete call takes.
  const [deleting, setDeleting] = useState<{ agentId: string; name: string } | null>(null);
  // The "new task" button's Agent picker.
  const [agentsOpen, setAgentsOpen] = useState(false);

  /**
   * The overview is read on entering its scope, and on nothing else: the scope change is what
   * asks the question, and the answer is about every Project at once — the store's focus and
   * event refetches are per-Project, so they have nothing to add here. The last answer is kept
   * while a new one is out, so coming back to the scope draws the Projects it already knows
   * instead of blanking.
   */
  useEffect(() => {
    if (scope !== "all") return;
    let cancelled = false;
    api
      .listAllSchedules()
      .then((res) => {
        if (cancelled) return;
        setAllProjects(res);
        setAllError(null);
      })
      .catch((e: unknown) => {
        // The answer it already has stays on screen, the way a failed refetch of the
        // Project's own list leaves its rows alone.
        if (!cancelled) setAllError(apiErrorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  /** The jump the overview's headings offer: that Project becomes the current one, on its own editable page. */
  const openProject = (id: string) => {
    setCurrentProjectId(id);
    setScope("project");
  };

  /** After a create, update or delete: the list, and the Agent cards' schedule counts. */
  const changed = () => {
    void refreshSchedules(projectId);
    void reloadAgents();
  };

  /**
   * Toggle: whole-file-replace semantics — resend original fields, only flip enabled. The write
   * names the Agent whose schedule directory holds the file, which the Project-wide list stamps
   * on every task.
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

  const filterLabels = scheduleFilterLabels();
  const visible = items === null ? [] : filterSchedules(items, filter, query);
  const groups = groupSchedulesByAgent(
    visible,
    agents.map((a) => a.agentId),
  );
  /** What to call the Agent holding a file: its display name, or the id if the Agent list no longer carries it. */
  const agentLabel = (agentId: string): string => {
    const agent = agents.find((a) => a.agentId === agentId);
    return agent ? agentDisplayName(agent) : agentId;
  };
  /** The overview's Projects, each holding the tasks the search box and the chips leave (see crossProjectGroups). */
  const overview = crossProjectGroups(allProjects?.projects ?? [], filter, query);
  const scopeLabels: Record<Scope, string> = {
    project: S.schedule.scopeProject,
    all: S.schedule.scopeAll,
  };

  return (
    <PageFrame className="[scrollbar-gutter:stable]">
      <PageHeader
        title={S.schedule.pageTitle}
        description={scope === "all" ? S.schedule.allScopeDesc : S.schedule.pageDesc}
        // A member reads the whole Project's schedule here and can change none of it; the "?"
        // says why, exactly as the settings tab's help fold does.
        info={scope === "project" && !isOwner ? S.schedule.readOnlyHint : undefined}
        actions={
          isOwner &&
          scope === "project" && (
            // Creating picks its Agent first: the file's directory is the task's owner for good,
            // and "whichever Agent is selected" is a setting the user cannot even see from here.
            // The overview has no create button at all — a new task belongs to one Project, and
            // that is the Project scope's page (see the page's own doc).
            <Dropdown
              open={agentsOpen}
              setOpen={setAgentsOpen}
              portal={{ direction: "down", align: "right" }}
              menuClass="w-56"
              button={
                <Button
                  size="sm"
                  variant="primary"
                  disabled={agents.length === 0}
                  onClick={() => setAgentsOpen(!agentsOpen)}
                >
                  {S.schedule.addTitle}
                </Button>
              }
            >
              <Menu density="sm">
                {agents.map((agent) => (
                  <MenuItem
                    key={agent.agentId}
                    density="sm"
                    glyph={
                      <AgentAvatar
                        id={agent.agentId}
                        name={agentDisplayName(agent)}
                        size={20}
                        className="shrink-0 rounded"
                      />
                    }
                    label={agentDisplayName(agent)}
                    onSelect={() => {
                      setAgentsOpen(false);
                      setForm({ agentId: agent.agentId, editing: null });
                    }}
                  />
                ))}
              </Menu>
            </Dropdown>
          )
        }
      >
        {/* Search and the state chips, on a line of their own under the title: they narrow the
            rows inside the groups (never the groups themselves), so they belong to the list
            rather than to the header's action row, where a member - who has no create button -
            would find them beside nothing. The scope switch leads the line: it is what decides
            which list the other two narrow. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="w-40">
            <Segmented
              cols={2}
              options={SCOPES.map((value) => ({ value, label: scopeLabels[value] }))}
              value={scope}
              onChange={setScope}
            />
          </div>
          <div className="w-full sm:w-56">
            <SearchInput
              size="sm"
              value={query}
              placeholder={S.schedule.panelSearchPlaceholder}
              aria-label={S.schedule.panelSearchPlaceholder}
              onChange={setQuery}
            />
          </div>
          <div className="w-full sm:w-72">
            <Segmented
              cols={4}
              options={SCHEDULE_FILTERS.map((value) => ({ value, label: filterLabels[value] }))}
              value={filter}
              onChange={setFilter}
            />
          </div>
        </div>
      </PageHeader>

      {scope === "all" ? (
        allProjects === null ? (
          allError !== null ? (
            <p className="text-sm text-red-600 dark:text-red-400">{allError}</p>
          ) : (
            <SkeletonList rows={4} />
          )
        ) : overview.length === 0 ? (
          <SettingsEmpty>{S.schedule.allScopeEmpty}</SettingsEmpty>
        ) : (
          <div className="space-y-4">
            {overview.map((project) => (
              <section
                key={project.projectId}
                className="rounded-md border border-gray-200 dark:border-gray-800"
              >
                {/* The Project's heading, and the only action the overview has: the jump. It
                    names the Project the way every other surface does, and the count is the
                    rows under it (never the Project's total, which the filter may have cut). */}
                <h2 className="flex min-w-0 items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                  <span className="min-w-0 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                    {project.name}
                  </span>
                  <span className="shrink-0 text-xs font-normal text-gray-400 dark:text-gray-500">
                    {S.schedule.pageGroupCount(project.count)}
                  </span>
                  {/* One verb for every heading, including the current Project's: it means
                      "open that Project's own page", and on the current one that is the scope
                      switch back. A label that changed per Project would read as a state badge
                      rather than a button. */}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="ml-auto shrink-0"
                    aria-label={`${S.schedule.openProject} ${project.name}`}
                    title={
                      project.projectId === projectId
                        ? S.schedule.openProjectHere
                        : S.schedule.openProjectHint
                    }
                    onClick={() => openProject(project.projectId)}
                  >
                    {S.schedule.openProject}
                  </Button>
                </h2>
                <div className="space-y-2 p-2">
                  {project.groups.map((group) => (
                    <div key={group.agentId}>
                      {/* The owning Agent, named per group: the file lives in its directory of
                          that Project, and this page holds no Agent list for another Project. */}
                      <h3 className="mb-1 flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <AgentAvatar
                          id={group.agentId}
                          name={group.agentId}
                          size={16}
                          className="shrink-0 rounded"
                        />
                        <span className="truncate font-mono">{group.agentId}</span>
                      </h3>
                      <ul className="space-y-1">
                        {group.items.map((item) => (
                          <li key={item.name}>
                            {/* Read-only by construction: no switch and no menu (owner=false),
                                and the callbacks are never reached. */}
                            <ScheduleRow
                              item={item}
                              owner={false}
                              busy={false}
                              onToggle={noop}
                              onEdit={noop}
                              onDelete={noop}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {project.invalidFiles.length > 0 && (
                    <div className="text-xs text-red-600 dark:text-red-400">
                      <p className="font-medium">{S.schedule.invalidFiles}</p>
                      <ul className="mt-0.5 space-y-1 font-mono">
                        {project.invalidFiles.map((file) => (
                          <li key={`${file.agentId}/${file.name}`}>
                            {file.agentId} · {file.name}: {file.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )
      ) : items === null ? (
        error !== null ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <SkeletonList rows={4} />
        )
      ) : items.length === 0 ? (
        <SettingsEmpty>{S.schedule.pageEmpty}</SettingsEmpty>
      ) : groups.length === 0 ? (
        <SettingsEmpty>{S.schedule.panelNoMatch}</SettingsEmpty>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.agentId}>
              <h2 className="mb-1.5 flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
                <AgentAvatar
                  id={group.agentId}
                  name={agentLabel(group.agentId)}
                  size={18}
                  className="shrink-0 rounded"
                />
                <span className="truncate">{agentLabel(group.agentId)}</span>
                <span className="shrink-0 text-xs font-normal text-fg-muted">
                  {S.schedule.pageGroupCount(group.items.length)}
                </span>
              </h2>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  // The name is unique inside one Agent's schedule directory, which is exactly
                  // what a group is.
                  <li key={item.name}>
                    <ScheduleRow
                      item={item}
                      owner={isOwner}
                      busy={busy}
                      onToggle={() => void toggle(item)}
                      onEdit={() => setForm({ agentId: item.agentId, editing: item })}
                      onDelete={() => setDeleting({ agentId: item.agentId, name: item.name })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Task files the scheduler skipped, each with the Agent whose directory holds it: the one
          thing no other surface reports, and the reason a task can be "missing" from the list. */}
      {invalidFiles.length > 0 && (
        <div className="mt-6 text-xs text-red-600 dark:text-red-400">
          <p className="font-medium">{S.schedule.invalidFiles}</p>
          <ul className="mt-0.5 space-y-1 font-mono">
            {invalidFiles.map((file) => (
              <li key={`${file.agentId}/${file.name}`}>
                {agentLabel(file.agentId)} · {file.name}: {file.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScheduleFormModal
        open={form !== null}
        // The Agent is fixed by what opened the dialog (the row's own file, or the picker), so it
        // is only ever read once the dialog is open.
        agentId={form?.agentId ?? ""}
        editing={form?.editing ?? null}
        onClose={() => setForm(null)}
        onSaved={changed}
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
    </PageFrame>
  );
}
