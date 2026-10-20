/**
 * "Read it once it has stopped moving" — the general form of the rail lesson (`rail.mjs`,
 * round 94), for the boxes that animate rather than for the one column: measure a box that is
 * still in flight and the number is true for that frame only, while whatever the assertion
 * compares it with was placed at the settled layout.
 *
 * Sampled on the real page (`getBoundingClientRect()` once per animation frame, 1280×900):
 *
 * - the right dock opening: width 1 → 8.88 → 43.78 → 121.13 → … → 491.09 → 503.44 → 510 → 512
 *   in ~300 ms, and the conversation column beside it shrinks with it (composer 746 → 428);
 * - the bottom dock opening into a fresh conversation: height 1 → 6.03 → 29.75 → 82.33 → 159.27 →
 *   … → 333.92 → 342.22 → 346.66 → 348, the last stretch reached at ~289 ms;
 * - the restore of the same dock after a reload: the same slide (29.61 → 82.3 → … → 348), so a
 *   wait that stops at the first sample within 24 px of the target — the shape `dock.spec`
 *   carried — returns at 333.84, while the box is still moving (and would equally pass for a
 *   restore that *settled* 20 px short).
 *
 * A one-shot `boundingBox()` right after "the tab is visible" can land anywhere in that range —
 * `boundingBox()` itself waits for the element to be attached, not for it to stop moving; so can
 * a `waitForTimeout(200)` written beside a 170 ms pop-in, which stays true only while the
 * animation's own duration does. Both are guesses about the motion. This waits for the motion to
 * be over instead: two consecutive frames whose boxes agree within `tolerance` mean the element
 * has arrived, however long it took. It does not promise the last pixel: an easing tail measured
 * 1.78 px short under a 1.4 s slowed-down restore, so callers compare with a couple of pixels of
 * slack rather than demanding equality.
 *
 * What it is NOT for: a box that keeps changing on its own (a streaming view re-rendering under
 * the pointer). Such a box never agrees with itself and the call fails loudly at the timeout
 * rather than hanging — that is the signal to assert something stable instead (see
 * `path-hints.spec.mjs`, which reloads and reads the settled card).
 */

/**
 * The box of `locator` once it has stopped moving, as `{ x, y, width, height }` (the same shape
 * `boundingBox()` returns, so it can stand in for it). Rejects if the element is detached
 * (zeros would otherwise look perfectly settled) or does not settle within `timeout` ms.
 */
export async function settledBox(locator, { tolerance = 0.5, timeout = 10_000 } = {}) {
  return locator.evaluate(
    (el, { tolerance, timeout }) =>
      new Promise((resolve, reject) => {
        const started = performance.now();
        const read = () => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        let previous = null;
        const frame = () => {
          if (!el.isConnected) {
            reject(new Error("settledBox: the element left the DOM before it settled"));
            return;
          }
          const box = read();
          const still =
            previous !== null &&
            Math.abs(box.x - previous.x) <= tolerance &&
            Math.abs(box.y - previous.y) <= tolerance &&
            Math.abs(box.width - previous.width) <= tolerance &&
            Math.abs(box.height - previous.height) <= tolerance;
          if (still) {
            resolve(box);
            return;
          }
          if (performance.now() - started > timeout) {
            reject(
              new Error(
                `settledBox: still moving after ${timeout} ms (last ${JSON.stringify(box)})`,
              ),
            );
            return;
          }
          previous = box;
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    { tolerance, timeout },
  );
}
