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
 * The dialogs are mounted OUTSIDE the panel: the panel's children unmount the moment the menu
 * closes, and a row closes the menu as it opens its dialog.
 *
 * The panel heads itself with the account it belongs to — avatar, nickname, and the id under
 * it once a nickname stands in for it. Both anchors are avatars, and the rail's is nothing but
 * an avatar, so without the header the menu never says whose account its rows act on.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { ConfirmModal, Dropdown, ICON_GAP, Menu, MenuItem, UserAvatar } from "@lmliheng/penguin-ui";
import type { DropdownPortal } from "@lmliheng/penguin-ui";
import { S } from "../../lib/strings";
import { useAuth } from "../../state/auth";
import { UpdateRow } from "../account/update-row";
import { UserVaultDialog } from "../account/user-vault-dialog";
import { FeedbackDialog, useFeedbackChannel } from "../account/feedback-dialog";
import { openUpdateModal } from "../../lib/use-update-flow";
import { SettingsDialog } from "../../features/settings/settings-dialog";
import { onSettingsRequest } from "../../features/settings/settings-request";
import type { SettingsSectionKey } from "../../lib/settings-sections";

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
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** The account's own global secrets, the one row here that edits data rather than navigating. */
  const [vaultOpen, setVaultOpen] = useState(false);
  /** The page a request asked for; the menu's own row asks for none (the viewer's first). */
  const [settingsSection, setSettingsSection] = useState<SettingsSectionKey | undefined>(undefined);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  /** The feedback row and its dialog; both live here because the row sits inside the panel and
   *  the dialog must outlive it. */
  const feedback = useFeedbackChannel();

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
