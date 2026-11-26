/**
 * Exporting the network record as JSON — from the panel's toolbar and from Settings › Network
 * record. Both paths write the same document and mask it again on the way out (the design's
 * "导出前强制再脱敏"), so a file that leaves this page can never carry a raw secret even though
 * the in-memory record keeps the raw value for an on-screen reveal.
 *
 * The record never leaves memory on its own; a file is written only here, on an explicit click.
 */
import { maskBody, maskHeaders, maskUrlQuery } from "../../api/net-log";
import type { NetRequest } from "../../api/net-log";

/** One entry as it is written out: masked headers, URL and bodies. */
function exportable(entry: NetRequest): Record<string, unknown> {
  return {
    id: entry.id,
    kind: entry.kind,
    method: entry.method,
    path: entry.path,
    url: maskUrlQuery(entry.url),
    sessionId: entry.sessionId,
    turn: entry.turn,
    requestId: entry.requestId,
    startedAt: new Date(entry.startedAt).toISOString(),
    durationMs: entry.durationMs,
    status: entry.status,
    resolution: entry.resolution,
    error: entry.error,
    attempts: entry.attempts,
    headers: maskHeaders(entry.headers).map(([name, value]) => ({ name, value })),
    requestBody: maskBody(entry.requestBody),
    requestTruncated: entry.requestTruncated,
    responseHeaders: maskHeaders(entry.responseHeaders).map(([name, value]) => ({ name, value })),
    responseBody: maskBody(entry.responseBody),
    responseTruncated: entry.responseTruncated,
    responseBytes: entry.responseBytes,
    frameCount: entry.frameCount,
  };
}

/** The whole record as a JSON document (masked). */
export function netLogJson(
  entries: readonly NetRequest[],
  exportedAt: number = Date.now(),
): string {
  return JSON.stringify(
    {
      exportedAt: new Date(exportedAt).toISOString(),
      note: "Adelie network record — masked on export; it lives in the page's memory only.",
      entries: entries.map(exportable),
    },
    null,
    2,
  );
}

/** Writes the record out as a downloaded `adelie-network-*.json`. */
export function exportNetLogJson(entries: readonly NetRequest[]): void {
  const url = URL.createObjectURL(new Blob([netLogJson(entries)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `adelie-network-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
