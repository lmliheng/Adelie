/**
 * The desktop pet's page: the entire content of the shell's companion window (main.ts creates it
 * at /pet; pet-notice.ts decides what it says).
 *
 * It is a page of this app on the app's own origin, so it is signed in by the same cookie the main
 * window is, and every fact it shows comes over the HTTP surface every other page uses — the
 * user-level event stream for what happened while nobody was looking, the shell's update snapshot,
 * and the account's pinned model balance. Nothing here talks to the shell directly.
 *
 * Three things, in the order they are useful:
 *
 * - A bubble above the penguin when something happens (see pet-notice.ts), which fades on its own:
 *   the pet speaks, it does not stack up a notification center.
 * - The panel behind a click: the pinned balance, the client-update state with the one action that
 *   state offers, the last notice, and the way to hide the pet again.
 * - The window itself, which drags: the page paints the penguin and marks the rest of the window
 *   draggable (`.pet-drag` / `.pet-no-drag` in styles.css — `-webkit-app-region` is Electron's and
 *   has no React type of its own).
 *
 * In a plain browser tab (anyone can open /pet) the penguin still draws and the notices still
 * arrive, and the two desktop-only readings say so instead of failing: everything about the shell
 * is gated on being the shell's own window, exactly as the update modal and the tray switch are.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DesktopUpdateStatus } from "@adelie/server/api";
import { providerInfo } from "@adelie/core/model-catalog";
import * as api from "../../api/endpoints";
import { openUserEvents } from "../../api/sse";
import { S } from "../../lib/strings";
import { isDesktopShellWindow } from "../../lib/account-menu";
import { useAuth } from "../../state/auth";
import { useTheme } from "../../state/theme";
import { useBalance, usePinnedBalance, requestBalance } from "../models/balance";
import { PINNED_BALANCE_REFRESH_MS, balanceView } from "../models/group-balance";
import {
  noticeForEvent,
  noticeForUpdate,
  noticeKey,
  noticeText,
  updateCommand,
  updateText,
} from "./pet-notice";
import type { PetNotice } from "./pet-notice";
import { Penguin } from "./penguin";

/** How long a bubble stays up before the pet stops talking. */
const BUBBLE_MS = 8_000;
/** How many notices the panel keeps, newest first. */
const NOTICE_KEEP = 5;
/**
 * How often the update snapshot is re-read. The shell pushes it to the server whenever its updater
 * moves, but nothing tells this page — the push direction is shell → server — so a slow poll is
 * what turns that into a bubble. Once a minute, on a route that answers from memory.
 */
const UPDATE_POLL_MS = 60_000;

/**
 * One line of the panel: a muted label with its optional action on the first line, and the value
 * under it. Stacked rather than side by side because the window is 260px wide — a label column
 * wide enough for "客户端更新" leaves the value an ellipsis, and these values (a balance reading,
 * a notice, the state of an update) are the whole point of the row.
 */
function Row({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-xs leading-tight text-gray-500 dark:text-gray-400">{label}</span>
        {action}
      </div>
      <div className="text-xs leading-tight break-words text-gray-800 dark:text-gray-100">
        {children}
      </div>
    </div>
  );
}

/** The small text button the panel's rows carry. */
function PetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-xs whitespace-nowrap text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {label}
    </button>
  );
}

/**
 * The pinned balance as the pet shows it — the same store the models page and the sidebar read
 * (features/models/balance.ts), so a refresh anywhere is a refresh here, and the same wording
 * (balanceView), so the amount reads identically wherever the user sees it.
 */
function usePetBalance(inShell: boolean): { text: string; title: string; refresh: () => void } {
  const pin = usePinnedBalance();
  const { currency } = useTheme();
  const projectId = pin?.projectId ?? null;
  const provider = pin?.provider ?? "";
  const state = useBalance(projectId, provider);
  useEffect(() => {
    if (projectId === null) return;
    void requestBalance(projectId, provider);
    const timer = window.setInterval(
      () => void requestBalance(projectId, provider),
      PINNED_BALANCE_REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, [projectId, provider]);
  const refresh = useCallback(() => {
    if (projectId !== null) void requestBalance(projectId, provider, true);
  }, [projectId, provider]);
  if (!inShell) return { text: S.pet.balanceUnavailable, title: "", refresh };
  if (pin === null) return { text: S.pet.balanceMissing, title: "", refresh };
  const view = balanceView(state, providerInfo(provider)?.label ?? provider, currency);
  return { ...view, refresh };
}

export function PetPage() {
  const { desktopMode, sessionVia } = useAuth();
  const inShell = isDesktopShellWindow({ desktopMode, sessionVia });
  const [notices, setNotices] = useState<readonly PetNotice[]>([]);
  const [bubble, setBubble] = useState<PetNotice | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [update, setUpdate] = useState<DesktopUpdateStatus | null>(null);
  const balance = usePetBalance(inShell);

  // The window is transparent where the page paints nothing (styles.css): the app's own windows
  // get a canvas background from the shared theme, and this is the one window that must not.
  useEffect(() => {
    document.body.classList.add("pet-body");
    return () => document.body.classList.remove("pet-body");
  }, []);

  /** Says one thing: it goes to the top of the panel's list and up into the bubble. */
  const speak = useCallback((notice: PetNotice) => {
    setNotices((prev) => [notice, ...prev].slice(0, NOTICE_KEEP));
    setBubble(notice);
  }, []);

  // What happened while nobody was looking: the user-level stream, which is this app's
  // cross-Session channel (schedules, approvals waiting, budget warnings).
  useEffect(() => {
    const connection = openUserEvents({
      onOmniMessage: () => {},
      onServerEvent: (event) => {
        const notice = noticeForEvent(event);
        if (notice !== null) speak(notice);
      },
    });
    return () => connection.close();
  }, [speak]);

  /** The last update state this page has announced, so a poll that changes nothing stays quiet. */
  const announcedUpdate = useRef<string | null>(null);
  const readUpdate = useCallback(() => {
    void api.getDesktopUpdate().then(
      (res) => {
        setUpdate(res.status);
        const notice = noticeForUpdate(res.status);
        if (notice === null) return;
        const key = noticeKey(notice);
        if (key === announcedUpdate.current) return;
        announcedUpdate.current = key;
        speak(notice);
      },
      // Not the shell's window, or the shell is not listening: the row says so on its own.
      () => setUpdate(null),
    );
  }, [speak]);
  useEffect(() => {
    if (!inShell) return;
    readUpdate();
    const timer = window.setInterval(readUpdate, UPDATE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [inShell, readUpdate]);

  useEffect(() => {
    if (bubble === null) return;
    const timer = window.setTimeout(() => setBubble(null), BUBBLE_MS);
    return () => window.clearTimeout(timer);
  }, [bubble]);

  const command = updateCommand(update);
  const latest = notices[0];
  const updateLabel =
    command === null
      ? null
      : command === "download"
        ? S.pet.download
        : command === "install"
          ? S.pet.install
          : S.pet.check;
  // The three commands the main window's update modal sends, from the same routes.
  const runCommand = (which: "check" | "download" | "install"): void => {
    const call =
      which === "download"
        ? api.desktopUpdateDownload
        : which === "install"
          ? api.desktopUpdateInstall
          : api.desktopUpdateCheck;
    void call().catch(() => {});
  };

  return (
    <div className="pet-drag flex h-screen w-screen flex-col items-center justify-end gap-1 overflow-hidden bg-transparent p-1">
      {panelOpen && (
        <div className="pet-no-drag w-full space-y-1 rounded-lg border border-gray-200 bg-white/95 p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900/95">
          <Row
            label={S.pet.balance}
            action={<PetButton label={S.pet.refresh} onClick={balance.refresh} />}
          >
            {/* The vendor's own figures and the read time, the same sentence the models page and
                the sidebar put behind their balance. Only when there is one: an empty hint would
                open an empty panel. */}
            <span {...(balance.title === "" ? {} : { "data-tooltip": balance.title })}>
              {balance.text}
            </span>
          </Row>
          <Row
            label={S.pet.update}
            action={
              updateLabel === null ? undefined : (
                <PetButton
                  label={updateLabel}
                  onClick={() => {
                    if (command !== null) runCommand(command);
                  }}
                />
              )
            }
          >
            {inShell ? updateText(update, S.pet) : S.pet.updateUnavailable}
          </Row>
          <Row label={S.pet.notices}>
            {latest === undefined ? S.pet.noNotices : noticeText(latest, S.pet)}
          </Row>
          {inShell && (
            <div className="flex justify-end pt-0.5">
              <button
                type="button"
                onClick={() => void api.setDesktopPet({ showPet: false }).catch(() => {})}
                className="rounded px-1 py-0.5 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                {S.pet.hide}
              </button>
            </div>
          )}
        </div>
      )}
      {/* The bubble is above the penguin and drags with the window: it holds no control. */}
      {!panelOpen && bubble !== null && (
        <div
          role="status"
          aria-live="polite"
          className="w-full rounded-lg border border-gray-200 bg-white/95 px-2 py-1 text-xs leading-snug text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-100"
        >
          {noticeText(bubble, S.pet)}
        </div>
      )}
      <button
        type="button"
        aria-label={S.pet.open}
        data-tooltip={S.pet.open}
        onClick={() => setPanelOpen((open) => !open)}
        className="pet-no-drag pet-bob block h-[72px] w-[72px] shrink-0 outline-none"
      >
        <Penguin className="h-full w-full" />
      </button>
    </div>
  );
}
