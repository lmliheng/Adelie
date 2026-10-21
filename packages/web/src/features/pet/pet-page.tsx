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
 * - The penguin, which carries the hand: it is what a person reaches for, so it is also what moves
 *   the window. The page moves its own window (`window.moveBy`, one step per pointer sample) rather
 *   than leaving the one visible thing inside a `no-drag` hole in a drag region it cannot use — the
 *   rest of the window keeps that OS drag region for the platforms whose window system delivers
 *   input to it. A press that stays put is a click and nothing else: it opens the panel and makes
 *   the pet hop, so a drag never also opens the panel on top of wherever the pet was put.
 *
 * The pet moves on its own too: it bobs, it blinks, its pupils follow the pointer (all three in
 * styles.css and penguin.tsx) and it hops when it has something to say.
 *
 * In a plain browser tab (anyone can open /pet) the penguin still draws and the notices still
 * arrive, and the two desktop-only readings say so instead of failing: everything about the shell
 * is gated on being the shell's own window, exactly as the update modal and the tray switch are. A
 * tab cannot move itself either — a browser ignores `moveBy` on a window a script did not open — so
 * dragging there does nothing at all, which is the honest answer for a window nobody can move.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DesktopUpdateStatus } from "@adelie/server/api";
import { providerInfo } from "@adelie/core/model-catalog";
import { usePointerDrag } from "@adelie/ui";
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
import { DRAG_SLOP_PX, petStep, pupilShift } from "./pet-motion";
import type { PetPoint } from "./pet-motion";
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
 * How long a hop's class stays on. A little longer than the hop itself (520ms, styles.css): the
 * class is what starts it, and taking it off mid-flight would stop the pet in the air.
 */
const HOP_MS = 620;

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

  // --- the penguin's own pointer work -------------------------------------
  //
  // Three things ride on the penguin, and none of them is state the app reads, so none of them
  // re-renders anything while a hand is on it: the window moves, the eyes follow, and a press that
  // stayed put opens the panel and hops. The drag itself is `usePointerDrag` — the app's one drag
  // state machine, which tracks the gesture on the window rather than on the element and says which
  // presses were drags — fed a threshold and a step from pet-motion.ts.
  const petRef = useRef<HTMLButtonElement | null>(null);
  /** The pointer's last screen position: the pet's moves are the steps between samples. */
  const pressAt = useRef<PetPoint | null>(null);
  /**
   * Whether the press just released was a drag. A drag ends with a `click` like any other press —
   * the browser fires one when the press and the release land on the same element, which capture
   * makes sure of — and that click must not open the panel.
   */
  const suppressClick = useRef(false);
  const [hopping, setHopping] = useState(false);

  /** Hops once, from the top: a click while a hop is running restarts it instead of being lost. */
  const hop = useCallback(() => {
    setHopping(false);
    window.requestAnimationFrame(() => setHopping(true));
  }, []);
  useEffect(() => {
    if (!hopping) return;
    const timer = window.setTimeout(() => setHopping(false), HOP_MS);
    return () => window.clearTimeout(timer);
  }, [hopping]);

  const petDragProps = usePointerDrag<object>({
    threshold: DRAG_SLOP_PX,
    begin: (event) => {
      // Screen coordinates, not the page's: the window moves under the pointer, so a step measured
      // in `clientX`/`clientY` would fold the pet's own movement back into the gesture.
      suppressClick.current = false;
      pressAt.current = { x: event.screenX, y: event.screenY };
      return {};
    },
    onMove: (event) => {
      const last = pressAt.current;
      if (last === null) return;
      const at = { x: event.screenX, y: event.screenY };
      pressAt.current = at;
      const step = petStep(last, at);
      // `moveBy` clamps the window to the screen; sitting at an edge is the pointer being there
      // too, so the samples stay in step and the pet simply stays put until the hand comes back.
      if (step.x !== 0 || step.y !== 0) window.moveBy(step.x, step.y);
    },
    onEnd: (_payload, dragged) => {
      suppressClick.current = dragged;
      pressAt.current = null;
    },
    onCancel: () => {
      pressAt.current = null;
    },
  });

  // The pupils follow the pointer. Written straight onto the element as two custom properties
  // (styles.css reads them on `.pet-pupils`): a pointer moving at 60Hz would otherwise re-render
  // this page — its panel, its balance row and its notice list — sixty times a second.
  useEffect(() => {
    const pet = petRef.current;
    if (pet === null) return;
    const onLook = (event: PointerEvent) => {
      const box = pet.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      // Off the pet's centre, in units of its own half-width and half-height: 1 is beside it.
      const shift = pupilShift(
        (event.clientX - (box.left + box.width / 2)) / (box.width / 2),
        (event.clientY - (box.top + box.height / 2)) / (box.height / 2),
      );
      pet.style.setProperty("--pet-look-x", `${shift.x}px`);
      pet.style.setProperty("--pet-look-y", `${shift.y}px`);
    };
    window.addEventListener("pointermove", onLook);
    return () => window.removeEventListener("pointermove", onLook);
  }, []);

  /** The click the penguin answers: keyboard activation reaches it too, and that is a click. */
  const onPetClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setPanelOpen((open) => !open);
    hop();
  };

  // The window is transparent where the page paints nothing (styles.css): the app's own windows
  // get a canvas background from the shared theme, and this is the one window that must not.
  useEffect(() => {
    document.body.classList.add("pet-body");
    return () => document.body.classList.remove("pet-body");
  }, []);

  /**
   * Says one thing: it goes to the top of the panel's list, up into the bubble, and the pet hops —
   * a notice arriving is the pet noticing, and seen out of the corner of an eye that is the whole
   * difference between a companion and a log line.
   */
  const speak = useCallback(
    (notice: PetNotice) => {
      setNotices((prev) => [notice, ...prev].slice(0, NOTICE_KEEP));
      setBubble(notice);
      hop();
    },
    [hop],
  );

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
      {/* The penguin is the window's handle: it drags (usePointerDrag above), and a press that
          stayed put is a click. `.pet-hop` replaces `.pet-bob` for as long as the hop lasts — one
          element, one animation, so the landing never fights the idle bob. `touch-none` keeps a
          finger's own scrolling and long-press gestures out of the drag. */}
      <button
        ref={petRef}
        type="button"
        aria-label={S.pet.open}
        data-tooltip={S.pet.open}
        onClick={onPetClick}
        {...petDragProps}
        className={`pet-no-drag block h-[72px] w-[72px] shrink-0 cursor-grab touch-none outline-none active:cursor-grabbing ${
          hopping ? "pet-hop" : "pet-bob"
        }`}
      >
        <Penguin className="h-full w-full" />
      </button>
    </div>
  );
}
