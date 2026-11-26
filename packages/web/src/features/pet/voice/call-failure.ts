/**
 * What a failed call says to the reader, in the reader's language.
 *
 * The transport (realtime-client.ts) names why the handshake did not happen, and the relay
 * (server/realtime/ws.ts) names why the provider answered the way it did — both in codes, because
 * neither runs in this window's language. The sentences live here, read from the active dictionary
 * the way every other piece of copy is, so an English window and a Chinese one each get theirs.
 */
import { S } from "../../../lib/strings";
import { RealtimeConnectError } from "./realtime-client";
import type { RealtimeEvent } from "./types";

/** Why this call never opened, as a sentence. */
export function connectFailureText(err: unknown): string {
  if (err instanceof RealtimeConnectError) {
    return err.reason === "closed" ? S.pet.callClosed : S.pet.callConnectFailed;
  }
  // Not ours to phrase: whatever threw gets to say it (nothing here throws text of its own).
  return err instanceof Error ? err.message : S.pet.callServiceFailed;
}

/**
 * What a `proxy.error` frame means, as a sentence. The code says which failure it is and `detail`
 * carries the provider's own answer (`HTTP 401: …`); a frame from a server that predates the code
 * still carries its English sentence, which is then all there is to show.
 */
export function proxyErrorText(event: RealtimeEvent): string {
  const code = typeof event.code === "string" ? event.code : "";
  const detail = typeof event.detail === "string" ? event.detail : "";
  if (code === "upstream_rejected") return S.pet.callRejected(detail);
  if (code === "upstream_unreachable") return S.pet.callUnreachable;
  const message = typeof event.message === "string" ? event.message : "";
  return message !== "" ? message : S.pet.callServiceFailed;
}

/** What a provider's own `error` frame means, as a sentence; its words when it gave any. */
export function providerErrorText(event: RealtimeEvent): string {
  const error = event.error as Record<string, unknown> | undefined;
  const message = typeof error?.message === "string" ? error.message : "";
  return message !== "" ? message : S.pet.callServiceError;
}

/**
 * What a call that has just closed says. The close itself hands over a reason, and it is a token
 * — the relay's `upstream`, our own `bye`, whatever the provider put there — not a sentence: it
 * used to land in the stage verbatim, on top of the refusal that had already explained the call
 * (`proxy.error` arrives first, then the socket closes with `upstream`). So the reason is not
 * shown; a call that was told why keeps that sentence, and one that was not gets the page's own.
 */
export function closedCallText(previous: string): string {
  return previous !== "" ? previous : S.pet.callClosed;
}
