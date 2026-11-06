/**
 * Whether the composer's microphone can be opened at all, and — when it cannot — which of the
 * three ways it was closed. The distinction is the whole point: only one of the three is about
 * permission, and telling a user to grant a permission the browser never offered is a dead end.
 *
 * The first two are decided BEFORE anything is asked, because on those two nothing is ever asked:
 *
 *   - The page may sit on an origin the browser does not treat as secure. There `navigator.
 *     mediaDevices` does not exist — not "was refused", does not exist — so no prompt is shown
 *     and none can be granted. A plain `http://` address that is not `localhost` is that case, and
 *     it is the one users hit: the desktop App's own window runs on `http://localhost:<port>` and
 *     is fine, while the same server opened at `http://10.0.0.5:7777` in a browser is not.
 *   - Otherwise the browser may simply have no capture support.
 *
 * What is left is asked for with `getUserMedia`, and its refusal is named by
 * {@link microphoneRefusal}. Neither function reaches for a browser global, so both are testable
 * without one.
 */

/** Why the microphone cannot be asked for at all, decided before anything is asked. */
export type MicrophoneObstacle = "insecure" | "unsupported";

/** The slice of the page that decides it. */
export interface MicrophoneEnvironment {
  isSecureContext: boolean;
  mediaDevices?: { getUserMedia?: unknown } | undefined;
}

/**
 * The obstacle in the way, or null when the microphone may be asked for. An insecure origin is
 * named as such even if it somehow exposes `mediaDevices`: the address is what would refuse the
 * request, so that is what the notice has to say.
 */
export function microphoneObstacle(env: MicrophoneEnvironment): MicrophoneObstacle | null {
  if (!env.isSecureContext) return "insecure";
  if (typeof env.mediaDevices?.getUserMedia !== "function") return "unsupported";
  return null;
}

/** What a refused `getUserMedia` was refused for, as far as the browser's error name says. */
export type MicrophoneRefusal = "denied" | "missing" | "busy" | "other";

/**
 * The refusal, in the terms the notice can act on: `denied` is the user's to undo (in the address
 * bar, not here), `missing` means no device, `busy` another program holding it. Anything else —
 * including a non-Error rejection, which some browsers produce — is `other`, which is where a
 * guess would otherwise go.
 */
export function microphoneRefusal(error: unknown): MicrophoneRefusal {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "other";
}
