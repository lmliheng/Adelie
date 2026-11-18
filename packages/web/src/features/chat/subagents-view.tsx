/**
 * Subagents panel content: one Task's call graph on top (root = the main session, one node per
 * spawned child; clicking a node switches the conversation below) and the selected child's
 * live conversation underneath, rendered with the SAME machinery as the main chat
 * (MessageStream over the child StreamModel with ctx.origin set to the child's chain) — so
 * streaming, nested tool cards, chips for deeper spawns, and pending approvals all keep
 * working inside the panel.
 *
 * Which Task: the most recent SUBAGENT-BEARING one by default — a plain user message never
 * wipes the graph; a new Task takes over the moment it spawns its own child (see
 * extractTopology). A chip click pins `taskScope` to that chip's Task instead (the chat
 * page's subagentTaskScope), so a chip on an older turn shows that turn's HISTORICAL graph
 * via extractTopologyForChild — falling back to the default scope when the anchor is no
 * longer referenced (e.g. a resync swapped the model).
 *
 * Selection: an explicit chip click (focusRequest) or a node click wins; with no explicit
 * choice the first child of the displayed Task is auto-focused (so opening the panel while a
 * subagent is spawning immediately shows it). Selecting the root shows a note instead of
 * duplicating the main transcript. A focused child outside the displayed Task keeps its
 * conversation visible (found by walking the origin chain); the graph simply has no
 * highlighted node.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useNavigate } from "react-router";
import type {
  ApprovalMode,
  SessionSandbox,
  ModelInfo,
  SessionInfo,
  SessionPatchRequest,
  SkillMetadataItem,
  SubagentRuntimeInfo,
  TaskInputPart,
} from "@adelie/server/api";
import {
  AgentAvatar,
  EmptyState,
  GlyphIcon,
  ICON_SIZE,
  NoticeStrip,
  StatusIcon,
  Text,
} from "@adelie/ui";
import { abortSubagent, getAgentSkills, messageSubagent, patchSession } from "../../api/endpoints";
import { S } from "../../lib/strings";
import type { NestedSessionMeta, StreamModel } from "../../lib/omni/stream-model";
import { ChatInput } from "./chat-input";
import type { ComposerControl } from "./chat-input";
import { thinkingLevelRefused } from "./thinking-level-refusal";
import type { PermissionPick } from "../../lib/permission-level";
import { noteSessionSeen } from "../../lib/session-seen";
import { useProject } from "../../state/project";
import { useSessions } from "../../state/sessions";
import {
  extractTopology,
  extractTopologyForChild,
  modelAtOrigin,
  resolveAgentLabel,
  shortSessionId,
} from "./agent-topology";
import type { TopologyNode } from "./agent-topology";
import { AgentTopologyView } from "./agent-topology-view";
import { MessageStream } from "./message-stream";
import type { StreamRenderContext } from "./message-stream";
import { subagentSendRefused, subagentStopRefused } from "./subagent-send-refusal";
import { readSubagentComposerKeep, writeSubagentComposerKeep } from "./subagent-composer-keep";
import type { SubagentComposerKeep } from "./subagent-composer-keep";
import {
  readSubagentSelection,
  restoreSubagentSelection,
  writeSubagentSelection,
} from "./subagent-panel-selection";
import { useSessionDraft } from "./use-session-draft";
import type { ComposerReference } from "../../lib/workspace-tree";

interface Selection {
  sessionId: string;
  /** ctx.origin chain of the selected conversation (ends with its own session id; empty = the root/main session). */
  origin: string[];
}

/**
 * The chip-click jump commands this tab has already applied — one entry per click, weak because
 * the page's command object is what is remembered and nothing else keeps it alive. See the
 * focusRequest effect in the body: a remount must not replay a command it already obeyed.
 */
const appliedFocus = new WeakSet<Selection>();

export function SubagentsView({
  session,
  model,
  version,
  taskRunning,
  ctx,
  focusRequest,
  taskScope,
  subagents,
  models,
  approvalMode,
  approvalModes,
  onChangePermission,
  modeSaving,
  parentThinkingLevel,
}: {
  session: SessionInfo;
  model: StreamModel;
  /** View-model version (repaint signal): keys the topology recompute and drives MessageStream's auto-follow. */
  version: number;
  taskRunning: boolean;
  /** Main-session render context (origin []): the child conversation derives its own from it. */
  ctx: StreamRenderContext;
  focusRequest: Selection | null;
  /** Displayed Task scope (the chat page's subagentTaskScope): null = latest; an anchor pins the historical Task containing that child. */
  taskScope: { anchorSessionId: string } | null;
  /** Live subagent children from the server's task_state (structural liveness): overrides the topology's text heuristics; empty for dead runtimes. */
  subagents: SubagentRuntimeInfo[];
  /** Project model list (the child composer's locked-model badge and context-window lookup). */
  models: ModelInfo[];
  /** The PARENT session's approval mode — child approvals are judged by it (the same value the main composer edits). */
  approvalMode: ApprovalMode;
  /** The approval modes the picker may offer for the PARENT session (the main composer's list). */
  approvalModes: readonly ApprovalMode[];
  /** Edits the PARENT session's approval mode and sandbox policy — a child runs under its root's. */
  onChangePermission: (pick: PermissionPick) => void | Promise<unknown>;
  modeSaving: boolean;
  /** The parent session's effective thinking level ("" = unknown): the child composer's display fallback — a child inherits it at spawn unless the spawning call pinned its own. */
  parentThinkingLevel: string;
}) {
  const { agents, setCurrentAgentId } = useProject();
  const { sessions } = useSessions();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Selection | null>(null);
  // What the reader picked before the last remount: this body is replaced when the layout moves
  // the panel between docks (subagent-panel-selection.ts), and landing back on the auto-focused
  // first child instead of the conversation they were reading is a different conversation.
  const remembered = useMemo(() => readSubagentSelection(session.sessionId), [session.sessionId]);
  // Every pick goes through here, not through setSelected: the pick is on screen only, so the
  // record has to be written at the same moment (a later effect could lose the remount race).
  const pick = useCallback(
    (next: Selection) => {
      setSelected(next);
      writeSubagentSelection(session.sessionId, next);
    },
    [session.sessionId],
  );
  // The selected child's composer, for the stream above it: "Add to conversation" in the
  // child's selection menu stages the excerpt there, in the conversation it was selected in.
  const childComposerRef = useRef<ComposerControl | null>(null);
  const addChildExcerpt = useCallback((reference: ComposerReference) => {
    childComposerRef.current?.addReference(reference);
  }, []);

  // A chip click focuses that child (fresh-object identity: re-clicking the same chip re-fires).
  // A command is a press, not a state: this body is remounted when the layout moves the panel
  // between docks, and the page keeps the last command standing, so without this record the new
  // mount would replay it and undo whatever the reader picked from the graph in between
  // (subagent-panel-selection.ts). The page drops its own commands when the tab closes; a layout
  // move keeps the tab, so "already applied" has to be remembered out here too.
  useEffect(() => {
    if (focusRequest !== null && !appliedFocus.has(focusRequest)) {
      appliedFocus.add(focusRequest);
      pick({ sessionId: focusRequest.sessionId, origin: focusRequest.origin });
    }
  }, [focusRequest, pick]);

  // Structural child liveness from the server (session id → running): the topology consults
  // it before its text heuristics, so revived and panel-started rounds read correctly.
  const liveStates = useMemo(
    () => new Map(subagents.map((s) => [s.sessionId, s.running])),
    [subagents],
  );

  const nodes = useMemo(
    () =>
      // A pinned scope (chip click) shows THAT Task's graph — historical or latest alike; when
      // its anchor is no longer referenced in the stream, fall back to the latest Task.
      (taskScope
        ? extractTopologyForChild(
            model,
            session.sessionId,
            taskRunning,
            taskScope.anchorSessionId,
            liveStates,
          )
        : null) ?? extractTopology(model, session.sessionId, taskRunning, liveStates),
    // version is the model's change signal (items mutate in place).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, version, session.sessionId, taskRunning, taskScope, liveStates],
  );

  // No explicit selection yet: what the reader picked before the last remount (only while that
  // child is still in the displayed Task's graph), then the Task's first child (null = none spawned).
  const firstChild = nodes.find((n) => n.depth > 0) ?? null;
  const active: Selection | null =
    selected ??
    restoreSubagentSelection(remembered, nodes) ??
    (firstChild ? { sessionId: firstChild.sessionId, origin: firstChild.origin } : null);

  const labelFor = (node: TopologyNode): string => {
    if (node.depth === 0) {
      const agent = agents.find((a) => a.agentId === session.agentId);
      // Same empty-name rule as resolveAgentLabel: an empty display name falls back to the id.
      return agent ? (agent.name?.length ? agent.name : agent.agentId) : session.agentId;
    }
    // Last-resort label is the short session id, not a generic word: two unknown children must stay distinguishable in the graph.
    return resolveAgentLabel(node, agents, sessions) ?? shortSessionId(node.sessionId);
  };

  const isRoot = active !== null && active.origin.length === 0;
  const activeNode = active ? (nodes.find((n) => n.sessionId === active.sessionId) ?? null) : null;
  const activeModel = active && !isRoot ? modelAtOrigin(model, active.origin) : null;
  const activeLabel = activeNode
    ? labelFor(activeNode)
    : active
      ? (resolveAgentLabel(
          { sessionId: active.sessionId, agentId: activeModel?.meta?.agentId ?? null },
          agents,
          sessions,
        ) ?? S.chat.subagent)
      : "";
  const activeRunning = activeNode?.running ?? false;

  // Same derivation the subagent card used: the child conversation's approval keys and
  // "Reasoning & Tools" running state follow the child's chain and its own running flag.
  const childCtx: StreamRenderContext | null = active
    ? { ...ctx, origin: active.origin, taskRunning: activeRunning }
    : null;

  /**
   * Jump to the selected subagent's own Session in the chat area. Subagent runs register
   * as Sessions (session_created over the parent's channel), so the child opens with the
   * full chat surface — its own composer, panels and history. Mirrors the sidebar's
   * openSession: the seen marker is stamped and the current Agent follows the child's.
   */
  const openAsSession = (): void => {
    if (!active) return;
    const row = sessions.find((s) => s.sessionId === active.sessionId);
    if (row) noteSessionSeen(row.projectId, row.sessionId, row.lastActiveAt);
    const agentId = row?.agentId ?? activeModel?.meta?.agentId ?? null;
    if (agentId !== null) setCurrentAgentId(agentId);
    navigate(`/chat/${active.sessionId}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Call graph of the displayed Task — latest by default, a chip's Task when pinned (capped height; scrolls both ways for deep/wide trees). */}
      <div className="shrink-0 border-b border-gray-200 px-3 pb-2 pt-1.5 dark:border-gray-800">
        <Text variant="eyebrow" className="mb-1.5">
          {S.subagentPanel.topologyLabel}
        </Text>
        {nodes.length > 1 ? (
          <div className="max-h-48 overflow-y-auto">
            <AgentTopologyView
              nodes={nodes}
              selectedId={active?.sessionId ?? null}
              labelFor={labelFor}
              onSelect={(node) => pick({ sessionId: node.sessionId, origin: node.origin })}
            />
          </div>
        ) : (
          <p className="py-1 text-xs text-gray-400 dark:text-gray-500">{S.subagentPanel.empty}</p>
        )}
      </div>

      {/* Selected conversation (or the root note / empty state). */}
      {active === null ? (
        <div className="min-h-0 flex-1">
          <EmptyState title={S.subagentPanel.empty} />
        </div>
      ) : isRoot ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {S.subagentPanel.mainSessionNote}
          </p>
        </div>
      ) : activeModel === null ? (
        // The chain broke (e.g. a resync swapped in a fresh model and this child hasn't re-streamed yet).
        <div className="min-h-0 flex-1">
          <EmptyState title={S.subagentPanel.empty} />
        </div>
      ) : (
        <>
          {/* Slim identity strip for the conversation below. The spawning call's description
              belongs to its node in the graph above, not here — one line, one place. */}
          <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-1.5 dark:border-gray-800/60">
            <AgentAvatar
              id={activeModel.meta?.agentId ?? active.sessionId}
              name={activeLabel}
              size={16}
            />
            <span className="min-w-0 truncate text-xs font-semibold text-gray-700 dark:text-gray-300">
              {activeLabel}
            </span>
            <span
              data-tooltip={active.sessionId}
              data-tooltip-extra
              className="shrink-0 font-mono text-xs text-fg-subtle"
            >
              {shortSessionId(active.sessionId)}
            </span>
            {activeRunning && (
              <StatusIcon state="running" size="xs" label={S.chat.subagentRunning} />
            )}
            <span className="min-w-0 flex-1" />
            {/* Jump out of the panel: the child conversation as a full Session. */}
            <button
              type="button"
              data-tooltip={S.subagentPanel.openAsSession}
              aria-label={S.subagentPanel.openAsSession}
              data-testid="subagent-open-session"
              onClick={openAsSession}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <GlyphIcon
                d="M14 4h6v6M20 4l-8 8M10 6H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"
                size={ICON_SIZE.rowLead}
              />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {/* Keyed by child: switching nodes resets scroll-follow instead of carrying the old position over. */}
            {childCtx && (
              <MessageStream
                key={active.sessionId}
                items={activeModel.items}
                version={version}
                ctx={childCtx}
                onAddExcerpt={addChildExcerpt}
              />
            )}
          </div>
          {/* Keyed by child too: switching nodes must not carry a half-typed message over. */}
          <SubagentComposer
            key={`composer-${active.sessionId}`}
            controlRef={childComposerRef}
            sessionId={session.sessionId}
            childSessionId={active.sessionId}
            running={activeRunning}
            meta={activeModel.meta}
            contextNow={activeModel.stats.contextNow}
            deliveredInputs={countDeliveredInputs(activeModel)}
            models={models}
            approvalMode={approvalMode}
            approvalModes={approvalModes}
            sandbox={session.sandbox}
            onChangePermission={onChangePermission}
            modeSaving={modeSaving}
            fallbackThinkingLevel={activeNode?.spawnThinkingLevel ?? parentThinkingLevel}
          />
        </>
      )}
    </div>
  );
}

/**
 * User-side inputs already visible in the child's stream (follow-up prompts and delivered
 * steering interjections alike): the composer's "queued" hint retires when this grows past
 * its value at queue time — whichever way the message reached the child.
 */
function countDeliveredInputs(model: StreamModel): number {
  let n = 0;
  for (const item of model.items) {
    if (item.kind === "user_text" || item.kind === "user_steering") n += 1;
  }
  return n;
}

/**
 * The selected child's composer (#272): the SAME ChatInput as the main conversation, in its
 * subagent variant — body, skills and slash skill commands, per-turn thinking level, context
 * ring (the child's own usage), locked-model badge, and the approval-mode selector (the
 * PARENT session's mode — child approvals are judged by it). Send semantics are a user input
 * on the child, whatever its state: steering while it runs, a follow-up round while idle, a
 * revival (resume-session) when it was released; the stop face on the action button aborts
 * only the child's current run. All of it lands on the same core channel input_subagent uses.
 */
function SubagentComposer({
  controlRef,
  sessionId,
  childSessionId,
  running,
  meta,
  contextNow,
  deliveredInputs,
  models,
  approvalMode,
  approvalModes,
  sandbox,
  onChangePermission,
  modeSaving,
  fallbackThinkingLevel,
}: {
  /** Handed to the ChatInput: the child stream's selection menu stages excerpts through it. */
  controlRef: RefObject<ComposerControl | null>;
  sessionId: string;
  childSessionId: string;
  running: boolean;
  meta: NestedSessionMeta | null;
  contextNow: number;
  deliveredInputs: number;
  models: ModelInfo[];
  approvalMode: ApprovalMode;
  approvalModes: readonly ApprovalMode[];
  /** The PARENT session's sandbox policy. */
  sandbox: SessionSandbox;
  /** Edits the PARENT session's approval mode and sandbox policy — a child runs under its root's. */
  onChangePermission: (pick: PermissionPick) => void | Promise<unknown>;
  modeSaving: boolean;
  /** Display fallback for the thinking picker while the user hasn't picked: the spawn call's explicit level, else the parent session's effective level (what the child inherited). */
  fallbackThinkingLevel: string;
}) {
  const { currentProject } = useProject();
  const projectId = currentProject?.projectId ?? null;
  // Skills of the CHILD's agent (it may differ from the parent's): candidates for the
  // toolbar dropdown and the slash menu; a failed fetch reads as no skills.
  const [skills, setSkills] = useState<SkillMetadataItem[]>([]);
  useEffect(() => {
    let stale = false;
    setSkills([]);
    const agentId = meta?.agentId;
    if (!projectId || !agentId) return;
    getAgentSkills(projectId, agentId)
      .then((res) => {
        if (!stale) setSkills(res.skills);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [projectId, meta?.agentId]);

  /**
   * Everything this panel has already told the reader about the child, in one record: the text in
   * the box, the three refusal lines the card draws (a message, a Stop, a thinking pin) and the
   * level a pin that landed put the child on. Held OUTSIDE the component because this body is
   * remounted whenever the layout moves it between the desktop right dock and the narrow merged
   * surface — inside, every one of those went with the remount (subagent-composer-keep.ts).
   */
  const [keep, setKeep] = useState<SubagentComposerKeep>(() =>
    readSubagentComposerKeep(childSessionId),
  );
  // Every write goes through here and lands in the store immediately, not in an effect: the text
  // is written on each edit, and the mount that replaces this one renders before this one's
  // cleanup runs — a value left for later is a value that remount never sees.
  const keepRef = useRef(keep);
  const remember = useCallback(
    (patch: Partial<SubagentComposerKeep>) => {
      const next = { ...keepRef.current, ...patch };
      keepRef.current = next;
      writeSubagentComposerKeep(childSessionId, next);
      setKeep(next);
    },
    [childSessionId],
  );

  /**
   * The unsent draft, staged skills included: the Session's own draft cache, keyed by the child
   * (this box edits that child's conversation), so the text also survives a reload. Discarded once
   * a send or a steer lands, which is when it stops being a draft.
   */
  const draft = useSessionDraft(childSessionId);

  // The level pinned on the child Session from this panel ("" = untouched, the child runs at
  // its own level): mirrors the main composer's per-session pick, scoped to this child —
  // written through PATCH on the child; core applies it from the child's next LLM request.
  // Adopted only once the PATCH has landed, like the main composer (which swaps the returned row
  // in): adopting a pick up front left the picker reading a level the child was never pinned to
  // when the write was refused.
  const pinChildLevel = (level: string): void => {
    remember({ level: null }); // The new attempt answers for itself; the old sentence goes.
    void patchSession(childSessionId, {
      thinkingLevel: level as SessionPatchRequest["thinkingLevel"],
    }).then(
      () => remember({ pinnedLevel: level }),
      // A refused pin leaves the picker reading what the child runs at, and this sentence — drawn
      // inside the card, in the composer's thinking-refusal slot — is the only account of the
      // press (7.95's rule): a toast would be gone after six seconds while the picker went on
      // showing the old level.
      (err: unknown) => remember({ level: thinkingLevelRefused(err) }),
    );
  };

  const modelRef = meta ? { provider: meta.provider, modelId: meta.modelId } : null;
  const contextWindow = modelRef
    ? models.find((m) => m.provider === modelRef.provider && m.modelId === modelRef.modelId)
        ?.contextWindow
    : undefined;

  const send = (text: string) => messageSubagent(sessionId, childSessionId, text);
  /**
   * The server's answer to a message that never reached the child, kept above the composer that
   * still holds the text (subagent-send-refusal.ts): the retry is that same button, and a toast
   * would have dismissed itself over it after six seconds.
   */
  const sendFailure = (err: unknown): void => {
    remember({ send: subagentSendRefused(err) });
  };
  /**
   * A Stop this panel's route did not take, kept above the same box (subagent-send-refusal.ts):
   * the child kept running, so the button inside the card is still 停止 and is the retry. It goes
   * with the run — the child going idle clears it — never by a timer, the same rule the chat
   * card follows.
   */
  useEffect(() => {
    // A run that is over cannot still be going: the sentence outliving it would describe a Stop
    // nobody can press anymore.
    if (!running && keepRef.current.stop !== null) remember({ stop: null });
  }, [running, remember]);

  return (
    <div className="shrink-0 border-t border-gray-100 px-2 pb-2 pt-2 dark:border-gray-800/60">
      {/* The transcript's reading column (MessageStream caps its messages at max-w-3xl), as the
          main conversation's composer does: a dock at full screen is as wide as the chat column
          or wider, and the composer must line up with the messages above it rather than span
          the surface. A docked panel is narrower than the cap, so there it changes nothing. */}
      <div className="mx-auto max-w-3xl">
        {keep.send !== null && (
          // Right above the box it belongs to: the draft is still in there, and pressing send
          // again is the whole retry. Cleared by the next attempt (both send and steer), so the
          // line always describes the press that produced it.
          <NoticeStrip
            tone="danger"
            role="alert"
            data-testid="subagent-send-refusal"
            className="mb-2 rounded-md border px-2.5 py-2 text-xs"
          >
            <span data-slot="body">{keep.send}</span>
          </NoticeStrip>
        )}
        {keep.stop !== null && (
          // The same strip for the other press that lands here: a Stop the route did not take. The
          // child is still running, so the button inside the box below is still 停止 and pressing
          // it again is the retry; the line says what the button cannot (nothing was stopped).
          <NoticeStrip
            tone="danger"
            role="alert"
            data-testid="subagent-stop-refusal"
            className="mb-2 rounded-md border px-2.5 py-2 text-xs"
          >
            <span data-slot="body">{keep.stop}</span>
          </NoticeStrip>
        )}
        <ChatInput
          variant="subagent"
          controlRef={controlRef}
          status={running ? "running" : "idle"}
          /* The draft is the child's, kept outside this component: a layout change remounts the
             panel, and a half-typed follow-up must be waiting when it comes back. The record is
             read first — it is the one written on the keystroke — and the Session draft cache is
             the fallback that also covers a reload. */
          initialText={keep.draft !== "" ? keep.draft : (draft.initial.text ?? "")}
          onTextChange={(text: string) => {
            draft.onTextChange(text); // The reload-survival cache (debounced)
            remember({ draft: text }); // …and the record the next mount reads, right now
          }}
          initialSkills={draft.initial.skills ?? []}
          onSkillsChange={draft.onSkillsChange}
          /* The chips staged above the box travel the same way as the text (the child's own
             selection menu stages them, via addReference): a layout change is not a new attempt,
             and nothing was sent, so they have to be there afterwards. Read once on mount and
             written on every add / remove; the sent clear writes through the same callback. */
          initialReferences={keep.references}
          onReferencesChange={(references) => remember({ references })}
          onSend={async (input: TaskInputPart[]) => {
            const text = input
              .filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join("\n\n")
              .trim();
            if (!text) return false;
            remember({ send: null });
            try {
              await send(text);
              // It is no longer a draft: the child's conversation has it. The cache and the record
              // are cleared together — the clear on send does not call back, so nothing else would.
              draft.discard();
              remember({ draft: "" });
              return true;
            } catch (err) {
              sendFailure(err);
              return false;
            }
          }}
          onSteer={async (text: string) => {
            remember({ send: null });
            try {
              await send(text);
              draft.discard();
              remember({ draft: "" });
              // steered/started/resumed alike: the message reached the child (the race where
              // the round settled mid-send simply started the next one). The queued hint
              // retires when the child's stream shows the delivered input.
              return "queued";
            } catch (err) {
              sendFailure(err);
              return "failed";
            }
          }}
          steeringDeliveredCount={deliveredInputs}
          onStop={async () => {
            // The press either aborts the child's current run (its stream then reports it idle and
            // the sentence, if any, goes with it — the effect above) or lands nowhere, in which
            // case the card is unchanged and the reason has to be said above it
            // (subagent-send-refusal.ts, `subagentStopRefused`). The route's 204 is not an error:
            // there was no run left to stop, which is the state this press wanted.
            remember({ stop: null }); // The new attempt answers for itself; the old sentence goes.
            const refusal = await abortSubagent(sessionId, childSessionId).then(
              () => null,
              (err: unknown) => subagentStopRefused(err),
            );
            if (refusal !== null) remember({ stop: refusal });
          }}
          modelRef={modelRef}
          models={models}
          // Display: the level this panel pinned (kept across a remount), else what the child
          // actually runs at (spawn-pinned level, else the parent's effective level it inherited).
          // A pick is PATCHed onto the child Session and applies from its next LLM request.
          turnThinkingLevel={keep.pinnedLevel || fallbackThinkingLevel}
          onChangeTurnThinkingLevel={pinChildLevel}
          thinkingRefusal={keep.level}
          {...(contextWindow !== undefined ? { contextWindow } : {})}
          contextNow={contextNow}
          vision={false}
          // A child's composer takes text only (see the subagent variant): no media intake at all,
          // so it never needs a video route either.
          video={false}
          approvalMode={approvalMode}
          approvalModes={approvalModes}
          sandbox={sandbox}
          onChangePermission={onChangePermission}
          modeSaving={modeSaving}
          agents={[]}
          skills={skills}
        />
      </div>
    </div>
  );
}
