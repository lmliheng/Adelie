/**
 * The account menu, shared by both avatars that open one: the pinned sidebar's user row and
 * the collapsed rail's avatar. One component rather than a copy per anchor — the rows
 * (Settings, the user-level vault, the scheduled-tasks page, the update entry, sign out) and the
 * dialog behind the first of them must stay the same menu from either side, and a second copy is
 * how two menus drift apart.
 *
 * Only the trigger differs, so the trigger is the caller's: it is handed the menu's own open
 * state, which is what keeps "what opening means" here rather than in two places.
 *
 * The menu also answers the two questions the rest of the shell leaves unanswered, because the
 * footer is where a user looks when something is "going on somewhere": what is running right
 * now (the project-level list at the top, live from the user channel — see
 * features/account/running-sessions.ts), and what the recent conversations cost (the run log
 * dialog behind its own row). Both are the Project's, not this account's: they name work the
 * user started from anywhere.
 *
 * The dialogs are mounted OUTSIDE the panel: the panel's children unmount the moment the menu
 * closes, and a row closes the menu as it opens its dialog.
 *
 * The panel heads itself with the account it belongs to — avatar, nickname, and the id under
 * it once a nickname stands in for it. Both anchors are avatars, and the rail's is nothing but
 * an avatar, so without the header the menu never says whose account its rows act on.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  ActivityIcon,
  ConfirmModal,
  Dropdown,
  ICON_GAP,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  UserAvatar,
} from "@adelie/ui";
import type { DropdownPortal } from "@adelie/ui";
import { S } from "../../lib/strings";
import { useAuth } from "../../state/auth";
import { UpdateRow } from "../account/update-row";
import { UserVaultDialog } from "../account/user-vault-dialog";
import { SessionLogDialog } from "../../features/account/session-log-dialog";
import { useRunningSessions } from "../../features/account/running-sessions";
import { FeedbackDialog, useFeedbackChannel } from "../account/feedback-dialog";
import { openFeedbackBoard } from "../../lib/feedback-board";
import { openUpdateModal } from "../../lib/use-update-flow";
import { SettingsDialog } from "../../features/settings/settings-dialog";
import { onSettingsRequest } from "../../features/settings/settings-request";
import type { SettingsSectionKey } from "../../lib/settings-sections";
import { agentDisplayName, useProject } from "../../state/project";
import { workspaceLabel } from "../../lib/session-grouping";

export function UserMenu({
  trigger,
  menuClass,
  portal,
  anchorRect,
  anchorOwner,
  className,
}: {
  /** The anchor's own look, wired to this menu's state: the sidebar's full-width row, the rail's avatar. */
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode;
  /** Panel size and, for an in-flow panel, its docking direction (see Dropdown). */
  menuClass?: string;
  /** Escape the anchor's clipping box by rendering the panel through a body portal. */
  portal?: DropdownPortal;
  /** Place the panel against this viewport box instead of the anchor's own — the rail hangs its menu off the rail's outer edge rather than over the rail. */
  anchorRect?: { top: number; bottom: number; left: number; right: number } | null;
  /** The element `anchorRect` was measured from, so only a scroll that moved it dismisses the panel. */
  anchorOwner?: () => HTMLElement | null;
  /** Extra classes for the anchor container (e.g. `mt-auto` in a flex column). */
  className?: string;
}) {
  const navigate = useNavigate();
  const { user, logout, desktopMode } = useAuth();
  const { agents, setCurrentAgentId } = useProject();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** The account's own global secrets, the one row here that edits data rather than navigating. */
  const [vaultOpen, setVaultOpen] = useState(false);
  /** The per-conversation usage dialog; mounted outside the panel like the rest. */
  const [logOpen, setLogOpen] = useState(false);
  /** The page a request asked for; the menu's own row asks for none (the viewer's first). */
  const [settingsSection, setSettingsSection] = useState<SettingsSectionKey | undefined>(undefined);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  /** The feedback row and its dialog; both live here because the row sits inside the panel and
   *  the dialog must outlive it. */
  const feedback = useFeedbackChannel();
  /** What is running right now, fetched on open and kept in step by the user channel. */
  const { sessions: running } = useRunningSessions(open);
  const agentNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) map.set(a.agentId, agentDisplayName(a));
    return map;
  }, [agents]);

  // Settings can be asked for from outside this menu (see settings-request.ts): the request
  // opens the same dialog, on the page it names.
  useEffect(
    () =>
      onSettingsRequest(({ section }) => {
        setSettingsSection(section);
        setSettingsOpen(true);
      }),
    [],
  );

  return (
    <>
      <Dropdown
        open={open}
        setOpen={setOpen}
        button={trigger({ open, toggle: () => setOpen(!open) })}
        {...(className !== undefined ? { className } : {})}
        {...(menuClass !== undefined ? { menuClass } : {})}
        {...(portal !== undefined ? { portal } : {})}
        {...(anchorRect !== undefined ? { anchorRect } : {})}
        {...(anchorOwner !== undefined ? { anchorOwner } : {})}
      >
        <div className="py-1">
          {/* Whose account this is. Not a row: nothing here is actionable, and the avatar plus
              the name is what makes the rows below unambiguous on the collapsed rail, where the
              anchor carries no text at all. The id shows under the nickname only when one is
              set — otherwise the two lines would repeat each other. */}
          {user && (
            <div
              className={`mb-1 flex items-center ${ICON_GAP.menu} border-b border-gray-100 px-3.5 pb-2.5 dark:border-gray-800`}
            >
              <UserAvatar
                userId={user.userId}
                {...(user.displayName !== undefined ? { displayName: user.displayName } : {})}
                {...(user.avatar !== undefined ? { avatar: user.avatar } : {})}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.displayName ?? user.userId}</p>
                {user.displayName !== undefined && (
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.userId}</p>
                )}
              </div>
            </div>
          )}
          {/* Settings dialog: everyone gets the row — the dialog always has the
              personal pages, and the server-global ones inside it stay gated by the
              section registry rather than by this row. The preference rows that used to
              stack here live on its pages now. */}
          <Menu>
            {/* What is running right now, above the navigation rows: this is the one part of the
                panel that changes without anyone pressing anything, and the empty line is an
                answer too ("nothing is running"). A row opens its conversation — the Agent
                follows the Session, the same way the sidebar's own cross-group click does. The
                list scrolls rather than pushing the rows below it out of the panel. */}
            <MenuLabel>{S.account.running.title}</MenuLabel>
            {running.length === 0 ? (
              <div role="presentation" className="px-3.5 pb-1.5 text-xs text-fg-muted">
                {S.account.running.empty}
              </div>
            ) : (
              <div role="presentation" className="max-h-48 overflow-y-auto">
                {running.map((s) => (
                  <MenuItem
                    key={s.sessionId}
                    glyph={
                      <ActivityIcon
                        activity={s.status === "compacting" ? "compacting" : "running"}
                        label={
                          s.status === "compacting" ? S.chat.statusCompacting : S.chat.statusRunning
                        }
                      />
                    }
                    label={s.title ?? S.account.running.untitled}
                    description={`${agentNames.get(s.agentId) ?? s.agentId} · ${workspaceLabel(s.workspace)}`}
                    trailing={
                      s.status === "compacting" ? S.chat.statusCompacting : S.chat.statusRunning
                    }
                    onSelect={() => {
                      setOpen(false);
                      setCurrentAgentId(s.agentId);
                      navigate(`/chat/${s.sessionId}`);
                    }}
                  />
                ))}
              </div>
            )}
            {/* The run record, right under the live list it explains: days of usage, split by
                conversation, in a dialog mounted outside this panel. */}
            <MenuSeparator />
            <MenuItem
              label={S.account.sessionLog.row}
              onSelect={() => {
                setOpen(false);
                setLogOpen(true);
              }}
            />
            <MenuItem
              label={S.settings.title}
              onSelect={() => {
                setOpen(false);
                setSettingsSection(undefined);
                setSettingsOpen(true);
              }}
            />
            {/* The account's own global secrets. A row here rather than a settings page because
                it is not a preference: it is the table of secrets the Agent vault's "assign"
                step reads from, and it belongs next to the account it belongs to. */}
            <MenuItem
              label={S.account.userVault.title}
              onSelect={() => {
                setOpen(false);
                setVaultOpen(true);
              }}
            />
            {/* The Project's scheduled tasks, the one page reached from here rather than from
                the sidebar: it is a Project-wide inventory visited now and then, not a
                workspace. A plain row of its own, right under the settings dialog's entry —
                both leave this menu, and the two navigations belong together. */}
            <MenuItem
              label={S.schedule.pageTitle}
              onSelect={() => {
                setOpen(false);
                navigate("/schedules");
              }}
            />
            {/* Feedback, below the navigation rows: the one row here that files something for
                the operator rather than opening a page of this account's own. Left out entirely
                where the install has no endpoint — see the hook. */}
            {feedback.configured && (
              <MenuItem
                label={S.feedback.title}
                onSelect={() => {
                  setOpen(false);
                  feedback.setOpen(true);
                }}
              />
            )}
            {/* The other feedback door, right under that one: the product's public board, which
                every install has (see lib/feedback-board.ts) and which leaves the app for the
                system browser. A plain row like its neighbours: the two labels already say which
                door files into this machine's queue and which one is out in the open, so nothing
                is explained under them. */}
            <MenuItem
              label={S.feedback.board}
              onSelect={() => {
                setOpen(false);
                openFeedbackBoard();
              }}
            />
            {/* Update entry, under the two navigation rows rather than on a page inside the
                settings dialog: one row for both backends (the server release here, the
                shell's own updater in the desktop window), naming where the update flow
                stands and opening the update modal — where the flow is explained and acted
                on. The modal is mounted by the app layout, so it outlives this menu. Hidden
                where this session can update nothing (a browser signed into a desktop-mode
                server, see updateModeFor). */}
            <UpdateRow
              onOpen={() => {
                setOpen(false);
                openUpdateModal();
              }}
            />
            {/* Hidden in desktop mode: the window IS the session — logging out would
                strand the user on a login page whose password was never shown. */}
            {!desktopMode && (
              <MenuItem
                danger
                onSelect={() => {
                  setOpen(false);
                  setConfirmingLogout(true);
                }}
                label={S.auth.logout}
              />
            )}
          </Menu>
        </div>
      </Dropdown>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        {...(settingsSection !== undefined ? { section: settingsSection } : {})}
      />
      {/* The account's own secrets, mounted here like the settings dialog so it outlives the
          menu that opened it. */}
      <UserVaultDialog open={vaultOpen} onClose={() => setVaultOpen(false)} />
      {/* The run record, likewise outside the panel — and it survives its own row's menu
          closing, which is the point of mounting it here. */}
      <SessionLogDialog open={logOpen} onClose={() => setLogOpen(false)} />
      {/* Feedback, likewise outside the panel: its row closes the menu as it opens this. */}
      <FeedbackDialog open={feedback.open} onClose={() => feedback.setOpen(false)} />
      {/* Signing out is confirmed first: the row sits in a menu of harmless entries, and a
          slip would end the session and land on the login page. Mounted beside the settings
          dialog, outside the dropdown, so it outlives the menu that opened it. */}
      <ConfirmModal
        open={confirmingLogout}
        title={S.auth.logoutConfirmTitle}
        confirmLabel={S.auth.logout}
        cancelLabel={S.common.cancel}
        onClose={() => setConfirmingLogout(false)}
        onConfirm={() => {
          setConfirmingLogout(false);
          void logout().then(() => navigate("/login"));
        }}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">{S.auth.logoutConfirmBody}</p>
      </ConfirmModal>
    </>
  );
}
