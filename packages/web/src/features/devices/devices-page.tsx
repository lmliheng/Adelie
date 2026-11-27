/**
 * Devices: the phones a device bridge has, as cards — the same language as Machines, a
 * different kind of thing (design §7.1). A machine is compute that runs an Agent; a phone is a
 * peripheral on somebody's desk. A card at rest is two lines (the name and the state with the
 * one detail that matters); everything else unfolds inside the card.
 *
 * Reads are on by default, so the page shows the snapshot without asking. A write is a button
 * that sends `approve: true` with that one command — the person clicked it — and the server
 * still refuses when the capability is not granted on this device. Admins additionally get the
 * per-capability switches, the pairing wizard and "forget".
 *
 * The list is re-read every 15 s (the bridge samples readings at that cadence); while a card is
 * open its detail is refreshed on the same tick, which is how the storage figure a person is
 * looking at stays honest without a manual refresh.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeviceDetailResponse, DeviceView, DevicesResponse } from "@adelie/server/api";
import {
  Badge,
  Button,
  Card,
  ChevronDown,
  ConfirmModal,
  EmptyState,
  Modal,
  NoticeStrip,
  PageFrame,
  PageHeader,
} from "@adelie/ui";
import { encode } from "uqr";
import * as api from "../../api/endpoints";
import { useProject } from "../../state/project";
import { useLocale } from "../../state/locale";
import { useAuth } from "../../state/auth";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { formatMessageTime } from "../../lib/format";
import { toneDot } from "../../lib/tone";
import type { Tone } from "../../lib/tone";
import { useDocumentTitle } from "../../lib/use-document-title";

/** The bridge samples readings every 15 s; the page follows that cadence rather than guessing. */
const POLL_MS = 15_000;

type DeviceEventRow = DeviceDetailResponse["events"][number];

interface PairingQr {
  qr: string;
  serviceName: string;
  code: string;
  expiresAt: string;
}

interface Shot {
  src: string;
  bytes: number;
  name: string;
}

interface NotificationRow {
  packageName: string;
  title?: string;
  postedAt?: string;
}

function stateTone(state: DeviceView["state"]): Tone {
  switch (state) {
    case "online":
      return "link";
    case "unauthorized":
    case "connecting":
    case "pairing":
      return "attention";
    default:
      return "muted";
  }
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "?";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function when(iso: string | null | undefined, locale: "zh" | "en"): string {
  if (iso === null || iso === undefined) return "—";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "—" : formatMessageTime(ms, locale);
}

/**
 * The wireless-pairing code, drawn as modules rather than an injected SVG string — the same way
 * the messaging scan-connect pages do it (uqr gives the matrix; the rects are ours, so no
 * markup is injected as HTML).
 */
function PairingQr({ value, label }: { value: string; label: string }): React.ReactElement {
  const { size, data } = encode(value);
  const quiet = 2;
  const span = size + quiet * 2;
  const modules: React.ReactElement[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (data[y]?.[x] !== true) continue;
      // 1.02 wide so neighbours meet: a hairline gap at fractional device pixel ratios
      // is what makes a rendered code hard to scan.
      modules.push(
        <rect key={`${x}-${y}`} x={x + quiet} y={y + quiet} width={1.02} height={1.02} />,
      );
    }
  }
  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      width={220}
      height={220}
      role="img"
      aria-label={label}
      className="shrink-0 rounded-md"
      shapeRendering="crispEdges"
    >
      <rect width={span} height={span} fill="#ffffff" />
      <g fill="#000000">{modules}</g>
    </svg>
  );
}

/** Three columns of label/value under a section title; a missing reading draws nothing. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="mb-1 text-xs font-medium text-fg-muted">{title}</h4>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 border-b border-line/60 py-0.5 last:border-0">
      <dt className="shrink-0 text-fg-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono tabular-nums text-fg">{children}</dd>
    </div>
  );
}

export function DevicesPage() {
  useDocumentTitle(S.devices.title);
  const { currentProject } = useProject();
  const projectId = currentProject?.projectId ?? "";
  const { locale } = useLocale();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin === true;

  const [list, setList] = useState<DevicesResponse | null>(null);
  const [detail, setDetail] = useState<{ device: DeviceView; events: DeviceEventRow[] } | null>(
    null,
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [permsOpen, setPermsOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairing, setPairing] = useState<PairingQr | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [forgetTarget, setForgetTarget] = useState<DeviceView | null>(null);
  const [forgetting, setForgetting] = useState(false);

  const reload = useCallback(
    async (quiet = true) => {
      if (projectId === "") return;
      try {
        const next = await api.listDevices(projectId);
        setList(next);
        if (quiet) setError(null);
        return next;
      } catch (err) {
        setError(`${S.devices.loadFailed}${apiErrorText(err)}`);
        return null;
      }
    },
    [projectId],
  );

  const openDevice = useCallback(
    async (deviceId: string) => {
      if (projectId === "") return;
      try {
        setDetail(await api.getDevice(projectId, deviceId));
      } catch (err) {
        setError(`${S.devices.loadFailed}${apiErrorText(err)}`);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      void reload();
      if (openId !== null) void openDevice(openId);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reload, openDevice, openId]);

  const devices = list?.devices ?? [];
  const bridgesOnline = useMemo(
    () => (list?.bridges ?? []).filter((bridge) => bridge.online),
    [list],
  );
  const adb = list?.adb ?? null;

  /** Runs one read command for a device and folds the answer into the card. */
  const act = async (device: DeviceView, key: string, work: () => Promise<void>): Promise<void> => {
    setBusy(`${device.id}:${key}`);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(apiErrorText(err));
    } finally {
      setBusy(null);
    }
  };

  const screenshot = (device: DeviceView) =>
    act(device, "shot", async () => {
      const result = await api.runDeviceCommand(projectId, device.id, { op: "screenshot" });
      if (!result.ok) throw new Error(result.error?.message ?? S.devices.screenshot.failed);
      const data = result.data as { base64: string; bytes: number };
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
      setShot({
        src: `data:image/png;base64,${data.base64}`,
        bytes: data.bytes,
        name: `device-${device.id}-${stamp}.png`,
      });
    });

  const sample = (device: DeviceView) =>
    act(device, "sample", async () => {
      await api.runDeviceCommand(projectId, device.id, { op: "snapshot.refresh" });
      window.setTimeout(() => void reload(), 1500);
    });

  const showNotifications = (device: DeviceView) =>
    act(device, "notify", async () => {
      const result = await api.runDeviceCommand(projectId, device.id, { op: "notify.list" });
      if (!result.ok) throw new Error(result.error?.message ?? "");
      const data = result.data as { notifications: NotificationRow[] };
      setNotifications(data.notifications);
      setNotifyOpen(true);
    });

  const togglePermission = async (device: DeviceView, capability: string, allowed: boolean) => {
    try {
      const body = await api.setDevicePermission(projectId, device.id, {
        capability: capability as never,
        allowed,
      });
      setList((previous) =>
        previous === null
          ? previous
          : {
              ...previous,
              devices: previous.devices.map((row) => (row.id === device.id ? body.device : row)),
            },
      );
      setDetail((previous) =>
        previous === null || previous.device.id !== device.id
          ? previous
          : { ...previous, device: body.device },
      );
    } catch (err) {
      setError(`${S.devices.permissions.failed}${apiErrorText(err)}`);
    }
  };

  const startPairing = async () => {
    setPairOpen(true);
    setPairing(null);
    setPairError(null);
    try {
      const result = await api.startDevicePairing(projectId, bridgesOnline[0]?.id);
      if (!result.ok) throw new Error(result.error?.message ?? "");
      setPairing((result.data as { pairing?: PairingQr }).pairing ?? null);
    } catch (err) {
      setPairError(`${S.devices.pair.failed}${apiErrorText(err)}`);
    }
  };

  const confirmForget = async () => {
    if (forgetTarget === null) return;
    setForgetting(true);
    try {
      await api.forgetDevice(projectId, forgetTarget.id);
      if (openId === forgetTarget.id) setOpenId(null);
      setForgetTarget(null);
      await reload();
    } catch (err) {
      setError(`${S.devices.forgetFailed}${apiErrorText(err)}`);
    } finally {
      setForgetting(false);
    }
  };

  return (
    <PageFrame width="lg">
      <PageHeader
        title={S.devices.title}
        description={S.devices.description}
        info={S.devices.info}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void reload()}
              disabled={projectId === ""}
            >
              {S.devices.refreshList}
            </Button>
            {isAdmin && (
              <Button variant="primary" size="sm" onClick={() => void startPairing()}>
                {S.devices.add}
              </Button>
            )}
          </>
        }
      />

      {error !== null && (
        <NoticeStrip tone="danger" className="mb-3 rounded-md px-3 py-2 text-xs">
          {error}
        </NoticeStrip>
      )}
      {adb !== null && !adb.found && adb.message !== undefined && (
        <NoticeStrip tone="attention" className="mb-3 rounded-md px-3 py-2 text-xs">
          {S.devices.adbMissing(adb.message)}
        </NoticeStrip>
      )}
      {list !== null && bridgesOnline.length === 0 && (
        <NoticeStrip tone="attention" className="mb-3 rounded-md px-3 py-2 text-xs">
          {S.devices.bridgeOffline}
        </NoticeStrip>
      )}

      {devices.length === 0 ? (
        <EmptyState
          title={isAdmin ? S.devices.empty : S.devices.noDevicesForMember}
          description={S.devices.emptyHint}
          action={
            isAdmin ? (
              <Button variant="secondary" size="sm" onClick={() => void startPairing()}>
                {S.devices.add}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {devices.map((device) => {
            const open = openId === device.id;
            const power = device.snapshot?.dynamic?.data.power;
            return (
              <Card as="li" key={device.id} padding="none">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
                  onClick={() => {
                    const next = open ? null : device.id;
                    setOpenId(next);
                    setDetail(null);
                    if (next !== null) void openDevice(next);
                  }}
                  aria-expanded={open}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${toneDot[stateTone(device.state)]}`}
                    aria-hidden
                  />
                  <span className="min-w-0 grow">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium text-fg">{device.name}</span>
                      <Badge tone="neutral">{S.devices.transport[device.transport]}</Badge>
                      {!device.bridgeOnline && <Badge tone="neutral">bridge</Badge>}
                      {power?.level !== undefined && (
                        <span className="font-mono text-xs tabular-nums text-fg-muted">
                          {power.level}%{power.charging === true ? " ⚡" : ""}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                      <span>{S.devices.state[device.state]}</span>
                      {device.platform !== null && <span>· {device.platform}</span>}
                      <span>
                        · {S.devices.fields.lastSeen} {when(device.lastSeenAt, locale)}
                      </span>
                      <span className="font-mono text-fg-subtle">· {device.id}</span>
                    </span>
                  </span>
                  <ChevronDown
                    className={`mt-0.5 size-4 shrink-0 text-fg-subtle ${open ? "rotate-180" : ""}`}
                  />
                </button>

                {open && (
                  <DeviceBody
                    device={detail?.device ?? device}
                    events={detail?.events ?? []}
                    locale={locale}
                    isAdmin={isAdmin}
                    busy={busy}
                    onSample={() => void sample(device)}
                    onScreenshot={() => void screenshot(device)}
                    onNotifications={() => void showNotifications(device)}
                    onPermissions={() => setPermsOpen(true)}
                    onForget={() => setForgetTarget(device)}
                  />
                )}
              </Card>
            );
          })}
        </ul>
      )}

      <Modal
        open={shot !== null}
        title={S.devices.screenshot.title}
        onClose={() => setShot(null)}
        widthClass="sm:max-w-2xl"
      >
        {shot !== null && (
          <div className="space-y-2">
            <img
              src={shot.src}
              alt={S.devices.screenshot.title}
              className="max-h-[70vh] w-full rounded-md border border-line object-contain"
            />
            <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
              <span className="font-mono tabular-nums">{formatBytes(shot.bytes)}</span>
              <a
                href={shot.src}
                download={shot.name}
                className="text-link underline-offset-2 hover:underline"
              >
                {S.devices.screenshot.download}
              </a>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={notifyOpen}
        title={S.devices.notifications.title}
        onClose={() => setNotifyOpen(false)}
      >
        {notifications === null || notifications.length === 0 ? (
          <p className="text-sm text-fg-muted">{S.devices.notifications.empty}</p>
        ) : (
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto text-xs">
            {notifications.map((row, index) => (
              <li
                key={`${row.packageName}-${index}`}
                className="flex items-baseline gap-2 border-b border-line/60 py-1 last:border-0"
              >
                <span className="shrink-0 font-mono text-fg-subtle">{row.packageName}</span>
                <span className="min-w-0 grow truncate">{row.title ?? ""}</span>
                <span className="shrink-0 text-fg-subtle">{when(row.postedAt, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {detail !== null && permsOpen && (
        <PermissionsModal
          device={detail.device}
          onClose={() => setPermsOpen(false)}
          onToggle={(capability, allowed) =>
            void togglePermission(detail.device, capability, allowed)
          }
        />
      )}

      <Modal
        open={pairOpen}
        title={S.devices.pair.title}
        onClose={() => {
          setPairOpen(false);
          setPairing(null);
          setPairError(null);
        }}
      >
        <div className="space-y-3 text-sm">
          <p className="text-fg-muted">{S.devices.pair.intro}</p>
          {pairError !== null && (
            <NoticeStrip tone="danger" className="rounded-md px-3 py-2 text-xs">
              {pairError}
            </NoticeStrip>
          )}
          {pairing === null && pairError === null && (
            <p className="text-fg-muted">{S.devices.pair.waiting}</p>
          )}
          {pairing !== null && (
            <>
              <div className="mx-auto w-fit rounded-md bg-white p-2">
                <PairingQr value={pairing.qr} label={S.devices.pair.title} />
              </div>
              <p className="text-center font-mono text-xs tabular-nums text-fg">
                {S.devices.pair.code(pairing.code)}
              </p>
              <p className="text-center text-xs text-fg-muted">
                {S.devices.pair.expires(when(pairing.expiresAt, locale))}
              </p>
              <p className="text-xs text-fg-muted">{S.devices.pair.done}</p>
            </>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={forgetTarget !== null}
        title={S.devices.buttons.forget}
        onClose={() => setForgetTarget(null)}
        onConfirm={() => void confirmForget()}
        confirmLabel={S.devices.buttons.forget}
        cancelLabel={S.common.cancel}
        busy={forgetting}
      >
        <p className="text-sm text-fg-muted">
          {forgetTarget === null ? "" : S.devices.confirmForget(forgetTarget.name)}
        </p>
      </ConfirmModal>
    </PageFrame>
  );
}

function DeviceBody({
  device,
  events,
  locale,
  isAdmin,
  busy,
  onSample,
  onScreenshot,
  onNotifications,
  onPermissions,
  onForget,
}: {
  device: DeviceView;
  events: DeviceEventRow[];
  locale: "zh" | "en";
  isAdmin: boolean;
  busy: string | null;
  onSample: () => void;
  onScreenshot: () => void;
  onNotifications: () => void;
  onPermissions: () => void;
  onForget: () => void;
}) {
  const t = S.devices;
  const perm = device.permissions as Record<string, boolean>;
  const can = (capability: string): boolean => perm[capability] === true;
  const stat = device.snapshot?.static?.data;
  const dyn = device.snapshot?.dynamic?.data;
  const screen = dyn?.screen;
  const network = dyn?.network;
  const power = dyn?.power;
  const memory = dyn?.memory;
  const storage = dyn?.storage;
  const working = (key: string) => busy === `${device.id}:${key}`;

  return (
    <div className="space-y-4 border-t border-line px-3 py-3">
      {device.snapshot === null && <p className="text-xs text-fg-muted">{t.noSnapshot}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title={t.sections.overview}>
          {device.platform !== null && <Field label={t.fields.platform}>{device.platform}</Field>}
          {(stat?.serial ?? device.serial) !== null && (
            <Field label={t.fields.serial}>{stat?.serial ?? device.serial}</Field>
          )}
          {stat?.buildId !== undefined && <Field label={t.fields.build}>{stat.buildId}</Field>}
          {stat?.firstSeenAt !== undefined && (
            <Field label={t.fields.firstSeen}>{when(stat.firstSeenAt, locale)}</Field>
          )}
          <Field label={t.fields.lastSeen}>{when(device.lastSeenAt, locale)}</Field>
          {dyn?.foreground !== undefined && (
            <Field label={t.fields.foreground}>{dyn.foreground}</Field>
          )}
          {device.grants.length > 0 && (
            <Field label={t.fields.projects}>{device.grants.join(", ")}</Field>
          )}
        </Section>

        {(power !== undefined || memory !== undefined || storage !== undefined) && (
          <Section title={t.sections.power}>
            {power?.level !== undefined && <Field label={t.fields.level}>{power.level}%</Field>}
            {power?.charging === true && <Field label={t.fields.charging}>⚡</Field>}
            {power?.temperatureC !== undefined && (
              <Field label={t.fields.temperature}>{power.temperatureC.toFixed(1)} °C</Field>
            )}
            {power?.health !== undefined && <Field label={t.fields.health}>{power.health}</Field>}
            {storage !== undefined && (
              <Field label={t.sections.storage}>
                {formatBytes(storage.usedBytes)} / {formatBytes(storage.totalBytes)}
              </Field>
            )}
            {memory !== undefined && (
              <Field label={t.sections.memory}>
                {formatBytes(memory.availableBytes)} / {formatBytes(memory.totalBytes)}
              </Field>
            )}
          </Section>
        )}

        {screen !== undefined && (
          <Section title={t.sections.screen}>
            {screen.widthPx !== undefined && screen.heightPx !== undefined && (
              <Field label={t.fields.resolution}>
                {screen.widthPx}×{screen.heightPx}
              </Field>
            )}
            {screen.densityDpi !== undefined && (
              <Field label={t.fields.density}>{screen.densityDpi}</Field>
            )}
            {screen.refreshHz !== undefined && (
              <Field label={t.fields.refresh}>{Math.round(screen.refreshHz)} Hz</Field>
            )}
            {screen.orientation !== undefined && (
              <Field label={t.fields.orientation}>{screen.orientation}</Field>
            )}
            {screen.locked !== undefined && (
              <Field label={t.fields.locked}>{screen.locked ? "🔒" : "—"}</Field>
            )}
          </Section>
        )}

        {network !== undefined && (
          <Section title={t.sections.network}>
            {network.wifi?.ssid !== undefined && (
              <Field label={t.fields.ssid}>{network.wifi.ssid}</Field>
            )}
            {network.wifi?.rssi !== undefined && (
              <Field label={t.fields.signal}>{network.wifi.rssi} dBm</Field>
            )}
            {(network.addresses ?? []).map((address) => (
              <Field key={address} label={t.fields.ip}>
                {address}
              </Field>
            ))}
          </Section>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!can("screen:view") || working("shot")}
          loading={working("shot")}
          onClick={onScreenshot}
        >
          {t.buttons.screenshot}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={working("sample")}
          loading={working("sample")}
          onClick={onSample}
        >
          {t.buttons.sample}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!can("notifications:read") || working("notify")}
          loading={working("notify")}
          onClick={onNotifications}
        >
          {t.buttons.notifications}
        </Button>
        {isAdmin && (
          <Button size="sm" variant="ghost" onClick={onPermissions}>
            {t.buttons.permissions}
          </Button>
        )}
        {isAdmin && (
          <Button size="sm" variant="danger" onClick={onForget}>
            {t.buttons.forget}
          </Button>
        )}
      </div>

      {events.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-medium text-fg-muted">{t.audit.title}</h4>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {events.slice(0, 20).map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-fg-subtle">{when(event.at, locale)}</span>
                <span className="shrink-0 text-fg-muted">{event.action ?? event.kind}</span>
                <span className="min-w-0 truncate text-fg-subtle">{event.actor ?? "system"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && <p className="text-xs text-fg-subtle">{t.permissions.hint}</p>}
      {!isAdmin && Object.entries(perm).some(([, allowed]) => allowed) && (
        <p className="text-xs text-fg-subtle">
          {Object.entries(perm)
            .filter(([, allowed]) => allowed)
            .map(
              ([capability]) =>
                (t.capabilities as Record<string, string>)[capability] ?? capability,
            )
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function PermissionsModal({
  device,
  onClose,
  onToggle,
}: {
  device: DeviceView;
  onClose: () => void;
  onToggle: (capability: string, allowed: boolean) => void;
}) {
  const t = S.devices;
  const perm = device.permissions as Record<string, boolean>;
  return (
    <Modal open title={t.permissions.title} onClose={onClose}>
      <div className="space-y-2">
        <p className="text-xs text-fg-muted">{t.permissions.hint}</p>
        <ul className="divide-y divide-line/60">
          {Object.entries(perm).map(([capability, allowed]) => (
            <li key={capability} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="block text-sm text-fg">
                  {(t.capabilities as Record<string, string>)[capability] ?? capability}
                </span>
                <span className="block font-mono text-xs text-fg-subtle">{capability}</span>
              </span>
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--ui-accent)]"
                  checked={allowed}
                  onChange={(event) => onToggle(capability, event.target.checked)}
                />
              </label>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
