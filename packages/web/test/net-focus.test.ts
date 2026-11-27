/**
 * The Network panel's jump from the transcript's inline request line (features/network/net-focus.ts).
 *
 * - A jump asks the panel to show a turn NOW; the body that applies it marks it applied, so a body
 *   mounted later (a layout move, a reopened tab) does not replay it over its own place.
 * - A second click is a new jump even within the same millisecond: the stamp never repeats and the
 *   order still counts up.
 */
import { describe, expect, it } from "vitest";
import {
  markNetworkFocusApplied,
  networkFocus,
  requestNetworkFocus,
  subscribeNetworkFocus,
} from "../src/features/network/net-focus";

describe("the Network panel's jump", () => {
  it("is a request until a body applies it, and history afterwards", () => {
    requestNetworkFocus(3);
    const jump = networkFocus();
    expect(jump).not.toBeNull();

    markNetworkFocusApplied(jump!.at);
    expect(networkFocus()).toBeNull();
  });

  it("stamps a later click after one that was applied, even in the same millisecond", () => {
    requestNetworkFocus(4);
    const first = networkFocus()!;
    markNetworkFocusApplied(first.at);

    requestNetworkFocus(4);
    const second = networkFocus();
    expect(second).not.toBeNull();
    expect(second!.turn).toBe(4);
    expect(second!.at).toBeGreaterThan(first.at);
  });

  it("leaves an older jump alone when a newer one is applied", () => {
    requestNetworkFocus(5);
    const older = networkFocus()!;
    requestNetworkFocus(6);
    const newer = networkFocus()!;

    markNetworkFocusApplied(newer.at);
    // The older stamp is behind the newest applied one: applying it out of order changes nothing.
    markNetworkFocusApplied(older.at);
    expect(networkFocus()).toBeNull();
  });

  it("tells subscribers when a jump is applied, so a reader of the store re-renders", () => {
    let heard = 0;
    const stop = subscribeNetworkFocus(() => {
      heard += 1;
    });
    requestNetworkFocus(7);
    markNetworkFocusApplied(networkFocus()!.at);
    stop();

    expect(heard).toBe(2);
  });
});
