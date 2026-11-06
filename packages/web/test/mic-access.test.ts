/**
 * Which of the three ways the microphone is closed, decided from what the page looks like and
 * what the browser's refusal is called. The cases are the ones the notices differ on, and the
 * one that matters most is first: an http address that is not `localhost` has no
 * `navigator.mediaDevices` at all, so it is not a permission the user can grant.
 */
import { describe, expect, it } from "vitest";
import { microphoneObstacle, microphoneRefusal } from "../src/lib/mic-access";

describe("microphoneObstacle", () => {
  it("names an insecure origin, where no microphone is exposed and no prompt is ever shown", () => {
    // Exactly what a browser reports on `http://10.0.0.5:7777` — see the live probe in
    // `deploy/`'s notes: mediaDevices is undefined, not merely refused.
    expect(microphoneObstacle({ isSecureContext: false, mediaDevices: undefined })).toBe(
      "insecure",
    );
  });

  it("still names the origin when an insecure page somehow exposes capture", () => {
    expect(
      microphoneObstacle({
        isSecureContext: false,
        mediaDevices: { getUserMedia: () => Promise.resolve() },
      }),
    ).toBe("insecure");
  });

  it("names a secure page whose browser has no capture support", () => {
    expect(microphoneObstacle({ isSecureContext: true, mediaDevices: undefined })).toBe(
      "unsupported",
    );
    expect(microphoneObstacle({ isSecureContext: true, mediaDevices: {} })).toBe("unsupported");
  });

  it("gets out of the way on a secure page that can capture", () => {
    expect(
      microphoneObstacle({
        isSecureContext: true,
        mediaDevices: { getUserMedia: () => Promise.resolve() },
      }),
    ).toBe(null);
  });
});

describe("microphoneRefusal", () => {
  const named = (name: string): Error => Object.assign(new Error(name), { name });

  it("reads a refusal as the user's to undo, and a device problem as the device's", () => {
    expect(microphoneRefusal(named("NotAllowedError"))).toBe("denied");
    expect(microphoneRefusal(named("NotFoundError"))).toBe("missing");
    expect(microphoneRefusal(named("NotReadableError"))).toBe("busy");
  });

  it("reads the alternative names browsers use for the same two situations", () => {
    expect(microphoneRefusal(named("SecurityError"))).toBe("denied");
    expect(microphoneRefusal(named("OverconstrainedError"))).toBe("missing");
    expect(microphoneRefusal(named("AbortError"))).toBe("busy");
  });

  it("falls back rather than guessing when the rejection is not a named error", () => {
    expect(microphoneRefusal(new Error("boom"))).toBe("other");
    expect(microphoneRefusal(undefined)).toBe("other");
    expect(microphoneRefusal("nope")).toBe("other");
  });
});
