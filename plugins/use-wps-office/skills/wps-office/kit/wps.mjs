/**
 * The WPS side's local relay, spoken from Node — the client half of WPS's own
 * "publish an add-on" service.
 *
 * Installing our panel into WPS is not a file copy. WPS runs a local relay HTTP
 * service (`http://127.0.0.1:58890`, started by the `ksoWPSCloudSvr://start=RelayHttpServer`
 * protocol) and owns an add-on list: the official WPS publish page installs and disables
 * add-ons by POSTing to it. So do we — from Node, which sidesteps the page's cross-origin
 * limits and needs no browser at all.
 *
 * The shapes below were read off that official page (`wpsjs publish`), which the Apache-2.0
 * project visresearch/WordAgent vendors as `backend/gui/resources/publish.html`:
 *
 *   - `POST /version`                  body `{}` (or the serverId envelope) -> a version string
 *   - `POST /deployaddons/runParams`   body = an add-on record + `cmd`
 *   - `POST /publishlist`              body `{}` -> the currently published add-ons, as JSON
 *
 * Every body is one JSON document, base64'd; on relay versions that support it, the document
 * is wrapped as `{ serverId, data }` (multi-user mode). We send the bare form first — that is
 * what the official page does whenever it has no serverId — and retry wrapped when the bare
 * form is refused, so one implementation covers both generations.
 */
import { spawn } from "node:child_process";

/** Where WPS's local add-on relay answers. Fixed by WPS, not configurable. */
export const RELAY_ORIGIN = "http://127.0.0.1:58890";

/** The add-on name registered with WPS. Stable: a re-install updates this entry, never adds a second. */
export const ADDON_NAME = "adelie_wps_panel";

/** The relay's answer is either the literal `OK` or an empty 200 body (see the official page). */
function relayOk(text) {
  const trimmed = text.trim();
  return trimmed === "OK" || trimmed === "";
}

/** One relay call: base64 body, the wrapped retry, and the collected answer. */
async function call(endpoint, payload, { serverId } = {}) {
  const bare = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const send = async (body) => {
    const res = await fetch(`${RELAY_ORIGIN}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    return { status: res.status, text: await res.text() };
  };
  const first = await send(bare);
  if (first.status < 300 && relayOk(first.text)) return first;
  // Relay generations that speak the envelope refuse the bare form; retry wrapped once.
  const wrapped = Buffer.from(
    JSON.stringify({ serverId: serverId ?? "00000000-0000-4000-8000-000000000000", data: bare }),
    "utf8",
  ).toString("base64");
  const second = await send(wrapped);
  return second;
}

/** The relay's version string, or null when nothing is listening (WPS not running). */
export async function relayVersion() {
  try {
    const res = await call("/version", {});
    return res.status < 300 ? res.text.trim() : null;
  } catch {
    return null;
  }
}

/** Whether the relay is up — i.e. whether WPS is running and has started its service. */
export async function relayReachable() {
  return (await relayVersion()) !== null;
}

/** The add-ons WPS currently has published, as the relay reports them. */
export async function listAddons() {
  const res = await call("/publishlist", {});
  if (res.status >= 300)
    throw new Error(`WPS 上架服务返回 ${res.status}：${res.text.slice(0, 200)}`);
  try {
    return JSON.parse(res.text);
  } catch {
    return [];
  }
}

/**
 * Install or disable one add-on. `cmd` is `enable` / `disable`; `url` is the panel page the
 * WPS host loads — an `online` add-on is fetched from that URL on every launch, which is
 * exactly how one panel serves every document.
 */
export async function setAddon({ cmd, name = ADDON_NAME, url, version = "1.0.0" }) {
  const payload = {
    cmd,
    name,
    url: url ?? "",
    addonType: "wps",
    online: "true",
    multiUser: "false",
    version,
    customDomain: "",
  };
  const res = await call("/deployaddons/runParams", payload);
  if (res.status >= 300 || !relayOk(res.text)) {
    throw new Error(
      `WPS 上架服务拒绝了 ${cmd}（${res.status}）：${res.text.slice(0, 200) || "空响应"}`,
    );
  }
  return true;
}

/**
 * Ask the WPS host to start its relay service, by opening WPS's own custom protocol. Only
 * meaningful on Windows, where that protocol is registered; elsewhere (and when WPS is
 * closed) the caller's retry ladder ends in a clear "open WPS first" message.
 */
export function startRelay() {
  if (process.platform !== "win32") return false;
  const child = spawn("cmd", ["/c", "start", "", "ksoWPSCloudSvr://start=RelayHttpServer"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return true;
}

/** Wait until the relay answers, nudging it once on Windows; null when it never came up. */
export async function ensureRelay({ timeoutMs = 20_000 } = {}) {
  if (await relayReachable()) return await relayVersion();
  startRelay();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await relayReachable()) return await relayVersion();
  }
  return null;
}

/** Whether our add-on is currently published to WPS. */
export async function addonInstalled() {
  try {
    const list = await listAddons();
    return Array.isArray(list) && list.some((a) => a?.name === ADDON_NAME && a?.enable !== "false");
  } catch {
    return false;
  }
}
