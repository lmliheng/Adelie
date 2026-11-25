/**
 * Scrolling up while a reply streams: the transcript must not bounce back down.
 *
 * In each theme (Primer shows each commit at once, so the commit snaps the view; Frost and
 * Console grow the reply every reveal frame, so the resize observer snaps it):
 *
 * - Given a reply streaming a paragraph every 125ms with the view following the bottom, and a
 *   renderer slowed four times, when the reader wheels up from the bottom in small steps until
 *   the text has really moved (see the gesture loop: how much of each wheel lands depends on the
 *   load), the view never moves back down: no snap to the bottom lands after the browser was
 *   free to put the gesture on screen, no frame shows a snap composed with the gesture, and once
 *   the gesture has moved the text down no frame moves it back up.
 * - For the second after the gesture, while the reply keeps growing below, the text on screen
 *   does not move at all: following stays off until the reader scrolls back down.
 *
 * The page records, while armed, every animation frame (the transcript's scrollTop and where a
 * paragraph that was on screen when the gesture began sits in the viewport), every wheel event
 * and every programmatic scrollTop write on the transcript. One line per gesture is printed
 * with the prefix BOUNCE (BOUNCE_DUMP=1 adds the raw recording); BOUNCE_GESTURES overrides the
 * number of gestures per theme, 6 by default.
 *
 * The browser scrolls a wheel the page cannot cancel on the compositor at once and tells the
 * page later; one the page can cancel waits until the page has handled it. A snap is late when
 * it raises scrollTop after that point — the first wheel's creation, or its handling — since
 * it then lands on a gesture the screen may already show. These are what the page can observe:
 * the compositor's own frames are not visible to it.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const USER = "scrollbounce";
const PASSWORD = "password123";
const GESTURES = Number(process.env.BOUNCE_GESTURES ?? 6);
/**
 * How many paragraphs each reply streams (the mock reads the count from the prompt, one paragraph
 * every 125ms), so 160 is ~20s of text. 7.206 (第三百三十五轮) sized the reply to be longer than a
 * gesture; that is a property of the machine's load, not of this file, and the measurement says
 * the path can be much longer than its 10s: a gesture's recording (arm → first wheel → up to
 * five bursts → the settle and the window) came to 3.2–12.5s, and once to 20s, on this machine
 * (2026-11-25, `BOUNCE-DUMP` recordings). The fixture therefore ends the turn itself right after
 * the window instead of waiting for the last paragraph: the reply only has to outlast the path,
 * not the whole test, so a reply that is comfortably too long costs nothing.
 */
const STREAM_PARAGRAPHS = 160;
/** The three themes: stored id → name. */
const THEMES = { github: "Primer", modern: "Frost", geek: "Console" };
/** The transcript's scroller (message-stream.tsx marks it for the specs that watch a gesture). */
const SCROLLER = "[data-stream-scroll]";

test.use({ viewport: { width: 1280, height: 720 } });

let projectId;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await provisionAndLogin(page.request, USER, PASSWORD);
  projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0].projectId;
  const models = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: "claude-4-8" },
      models: [
        {
          provider: "custom",
          modelId: "claude-4-8",
          apiKey: "sk-mock",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(models.ok(), await models.text()).toBeTruthy();
  await page.close();
});

/** Page side: the recorder, installed once the transcript has mounted. */
function installRecorder(selector) {
  const el = document.querySelector(selector);
  const native = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
  const rec = { on: false, frames: [], wheels: [], writes: [] };
  /** Paragraph identities, so a frame can say where the same text sat in the one before. */
  const ids = new WeakMap();
  let nextId = 0;
  /** [id, top] of each paragraph on screen: what the reader sees, wherever the anchor is. */
  const onScreen = () => {
    const box = el.getBoundingClientRect();
    const ps = el.querySelectorAll("p");
    // Paragraphs are in document order, so bisect for the first one that ends below the top of the
    // viewport, then walk forward to the first that starts below its bottom. Scanning only the
    // last 60 stopped covering the screen once a gesture had wheeled far enough up a conversation
    // with several replies (the gesture's readout then froze while the wheels kept moving the
    // view), and a reply that streams off the bottom of the screen is not in that list either.
    let lo = 0;
    let hi = ps.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ps[mid].getBoundingClientRect().bottom > box.top) hi = mid;
      else lo = mid + 1;
    }
    const seen = [];
    for (let i = lo; i < ps.length; i += 1) {
      const r = ps[i].getBoundingClientRect();
      if (r.top >= box.bottom) break;
      if (!ids.has(ps[i])) ids.set(ps[i], (nextId += 1));
      seen.push([ids.get(ps[i]), r.top]);
    }
    return seen;
  };
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get() {
      return native.get.call(this);
    },
    set(value) {
      const before = native.get.call(this);
      native.set.call(this, value);
      if (rec.on) rec.writes.push({ t: performance.now(), before, after: native.get.call(this) });
    },
  });
  window.addEventListener(
    "wheel",
    (e) => {
      if (!rec.on) return;
      rec.wheels.push({ t: performance.now(), ts: e.timeStamp, cancelable: e.cancelable });
    },
    { capture: true, passive: true },
  );
  const frame = () => {
    if (rec.on) {
      rec.frames.push({
        t: performance.now(),
        top: native.get.call(el),
        h: el.scrollHeight,
        seen: onScreen(),
      });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__bounce = {
    start() {
      rec.frames = [];
      rec.wheels = [];
      rec.writes = [];
      rec.on = true;
    },
    stop() {
      rec.on = false;
      return { frames: rec.frames, wheels: rec.wheels, writes: rec.writes };
    },
    toBottom() {
      el.scrollTop = el.scrollHeight;
    },
    /**
     * How far the text on screen has moved down since the gesture began — the same measure
     * `analyze()` computes from the whole recording (the median paragraph's move between two
     * frames, summed from the first wheel on), so the gesture loop and the assertions below read
     * one number. Recomputing it after a pause keeps it stable: while the wheels are still being
     * applied quickly, most of a frame's move falls between frames the recorder can pair up.
     */
    moved() {
      const first = rec.wheels[0];
      if (first === undefined) return 0;
      let travel = 0;
      for (let i = 1; i < rec.frames.length; i += 1) {
        const prev = rec.frames[i - 1];
        const f = rec.frames[i];
        if (f.t < first.ts) continue;
        const was = new Map(prev.seen);
        const d = f.seen.filter(([id]) => was.has(id)).map(([id, top]) => top - was.get(id));
        if (d.length === 0) continue;
        d.sort((x, y) => x - y);
        travel += d[Math.floor(d.length / 2)];
      }
      return travel;
    },
    following(minHeight) {
      return (
        el.scrollHeight > minHeight && el.scrollHeight - native.get.call(el) - el.clientHeight <= 1
      );
    },
    height() {
      return el.scrollHeight;
    },
  };
}

/**
 * The bounces in one gesture's recording, by kind (see the header), and what the gesture did;
 * `stillFrom` starts the stay-put window.
 */
function analyze({ frames, wheels, writes }, stillFrom) {
  const first = wheels[0];
  if (first === undefined) return { bounces: [{ kind: "no-wheel" }] };
  const freeAt = first.cancelable ? first.t : first.ts;
  const rising = writes.filter((w) => w.after > w.before + 0.5);
  const bounces = rising
    .filter((w) => w.t >= freeAt)
    .map((w) => ({
      kind: "late-snap",
      t: Math.round(w.t - first.ts),
      from: w.before,
      to: w.after,
    }));
  /** How far the text on screen moved down since the frame before (the median paragraph). */
  const moved = (prev, f) => {
    const was = new Map(prev.seen);
    const d = f.seen.filter(([id]) => was.has(id)).map(([id, top]) => top - was.get(id));
    if (d.length === 0) return 0;
    d.sort((x, y) => x - y);
    return d[Math.floor(d.length / 2)];
  };
  let movedDown = false;
  let travel = 0;
  const path = [];
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const f = frames[i];
    if (f.t < first.ts) continue;
    const snap = rising.filter((w) => w.t >= prev.t && w.t <= f.t).at(-1);
    if (f.top > prev.top + 0.5 && snap !== undefined && f.top < snap.after - 0.5) {
      bounces.push({
        kind: "composed",
        t: Math.round(f.t - first.ts),
        snap: snap.after,
        to: f.top,
      });
    }
    const d = moved(prev, f);
    travel += d;
    path.push({ t: f.t, travel });
    // "The text moved down" is armed by a real move, not by the ±1px the median wobbles through
    // while the reply keeps growing (a still transcript reflows a pixel or two on most frames).
    if (d > 2) movedDown = true;
    // And the up-move is only a bounce once the browser was free to put the gesture on screen —
    // the same clock the header gives late snaps. Before that point (the input is stamped up to a
    // couple of hundred ms before the page handles it) a following view still snapping to the
    // bottom is doing its job: measured 2026-11-25, the first wheel was stamped at 0 and handled
    // at +224ms, and the legit snaps at +92 / +200 were read as "moved back up".
    else if (movedDown && f.t >= freeAt && d < -0.5) {
      bounces.push({ kind: "after-up", t: Math.round(f.t - first.ts), by: -d });
    }
  }
  const still = path.filter((p) => p.t >= stillFrom).map((p) => p.travel);
  const tail = frames.filter((f) => f.t >= stillFrom);
  return {
    bounces,
    firstWheelCancelable: first.cancelable,
    wheelLatency: Math.round(first.t - first.ts),
    textMovedDown: Math.round(still[0] ?? travel),
    stillDrift: still.length > 0 ? Math.max(...still) - Math.min(...still) : null,
    grewWhileStill: tail.length > 0 ? tail[tail.length - 1].h - tail[0].h : 0,
  };
}

/** Waits until `want` replies have shown their paragraph `n`. */
const paragraphShown = (page, n, want) =>
  page.waitForFunction(
    ([selector, n, want]) =>
      [...document.querySelectorAll(`${selector} p`)].filter((p) =>
        p.textContent.startsWith(`Paragraph ${n}.`),
      ).length >= want,
    [SCROLLER, n, want],
    { polling: 100, timeout: 30_000 },
  );

for (const [theme, name] of Object.entries(THEMES)) {
  test(`${name}: wheeling up while a reply streams never moves the view back down`, async ({
    page,
  }) => {
    test.setTimeout(60_000 + GESTURES * 30_000);
    await page.addInitScript((id) => localStorage.setItem("penguin.themeId", id), theme);
    await login(page.request, USER, PASSWORD);
    const created = await page.request.post(
      `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
      { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" } },
    );
    expect(created.ok(), await created.text()).toBeTruthy();
    const sessionId = (await created.json()).session.sessionId;
    await page.goto(`/chat/${sessionId}`);
    const input = page.getByPlaceholder(/输入消息/);
    await input.waitFor();

    const cdp = await page.context().newCDPSession(page);
    const results = [];
    for (let i = 1; i <= GESTURES; i += 1) {
      await input.fill(`scroll bounce test ${i} ${STREAM_PARAGRAPHS}`);
      await page.keyboard.press("Enter");
      await paragraphShown(page, 6, i);
      if (i === 1) {
        // The transcript mounts with the conversation's first message.
        await page.evaluate(installRecorder, SCROLLER);
      }
      // Every gesture starts with the pointer back over the transcript: its box moves as the
      // toolbar, the composer and the notices change height across gestures, and a wheel over
      // something else is still recorded by the page but never reaches the transcript.
      const box = await page.locator(SCROLLER).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      // Following: put the view at the bottom and watch it stay there while the reply grows.
      // A commit can land between the jump and its scroll event and leave the view short of
      // the bottom, not following; the jump is then simply taken again.
      await expect
        .poll(
          async () => {
            await page.evaluate(() => window.__bounce.toBottom());
            const h0 = await page.evaluate(() => window.__bounce.height());
            return page
              .waitForFunction((h) => window.__bounce.following(h + 200), h0, {
                polling: "raf",
                timeout: 1500,
              })
              .then(
                () => true,
                () => false,
              );
          },
          { timeout: 10_000, intervals: [0] },
        )
        .toBe(true);
      await page.evaluate(() => window.__bounce.start());
      // Following was just confirmed on a commit, so start each gesture at a different point of
      // the commit cycle (a golden-ratio walk over 0–140ms): the race is with the next commit.
      await page.waitForTimeout(100 + Math.round(((i * 0.618034) % 1) * 140));
      // A wheel does not land in full when the machine is busy: under the whole suite's load plus
      // the ×4 throttle, 10 × 50px once arrived as 41px on screen (BOUNCE line, 2026-11-25), and
      // the gesture then failed on "the wheel scrolled up" rather than on the behaviour. So the
      // same burst is repeated until the text has really moved — the same measure the assertions
      // read, taken after a pause so a burst of wheels is not lost between frames — with a round
      // cap, so a page that keeps snapping back ends on the behaviour assertion instead of
      // spinning; STREAM_PARAGRAPHS is sized to outlast this cap. One burst is what a quiet
      // machine needs, so its rhythm is unchanged.
      const SCROLL_GOAL = 200; // the text has to move more than 100px; reflow costs some of this
      for (let round = 0; round < 5; round += 1) {
        for (let k = 0; k < 10; k += 1) {
          await page.mouse.wheel(0, -50);
          await page.waitForTimeout(30);
        }
        await page.waitForTimeout(120);
        const moved = await page.evaluate(() => window.__bounce.moved());
        console.log(`SCROLL gesture ${i} round ${round}: moved ${Math.round(moved)}`);
        if (moved > SCROLL_GOAL) break;
      }
      // The reply streams ~20s (STREAM_PARAGRAPHS paragraphs every 125ms), so this second still
      // has text arriving below it even when the setup above plus the extra rounds took several
      // seconds under the throttle — the "while the reply grows" half of the check means
      // something only then. This is what 7.206 measured with the old fixed ~4s reply: the
      // window opened at +4.6s to +6.8s, after the stream was over, and the aggregate check went
      // red on a loaded machine.
      await page.waitForTimeout(400);
      const stillFrom = await page.evaluate(() => performance.now());
      await page.waitForTimeout(1000);
      const recording = await page.evaluate(() => window.__bounce.stop());
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      const r = { theme: name, gesture: i, ...analyze(recording, stillFrom) };
      results.push(r);
      console.log(`BOUNCE ${JSON.stringify(r)}`);
      if (process.env.BOUNCE_DUMP) console.log(`BOUNCE-DUMP ${JSON.stringify(recording)}`);
      // The turn ends before the next one is sent. The reply is sized to outlast the window
      // (STREAM_PARAGRAPHS), so it is still streaming here: the fixture stops it rather than
      // waiting for its remaining seconds — a reader who wheels up and then presses Stop is an
      // ordinary turn, and the next prompt must start a new one, not queue behind this one.
      const stop = page.getByRole("button", { name: "停止", exact: true });
      await expect(stop, `gesture ${i}: the reply is still streaming`).toBeVisible();
      await stop.click();
      await expect(stop).toHaveCount(0, { timeout: 30_000 });
      // A prompt typed before the abort has really landed is queued as a follow-up of the dying
      // turn, and a run started that way has no Stop in the composer — on 2026-11-25 gesture 3 of
      // Primer was sent 0.15s after the previous abort, streamed its whole reply that way, and
      // the still-streaming check above found nothing to press. The composer's own Send is not
      // enough to go by (it goes idle before the server does), so wait for the server to stop
      // listing this Session as running, then for that idle Send.
      await expect
        .poll(
          // Asked from inside the page: a same-origin fetch goes over the origin the app itself
          // uses, while the test's own request context resolves `localhost` on its own and can
          // land on ::1, where this server does not listen (measured: ECONNREFUSED ::1, and a
          // pooled keep-alive socket the server had already closed surfaced as ECONNRESET).
          () =>
            page.evaluate(
              async ([url, id]) => {
                const res = await fetch(url);
                const rows = (await res.json()).sessions ?? [];
                return rows.some((row) => row.sessionId === id);
              },
              [`${BASE}/api/projects/${projectId}/sessions/running`, sessionId],
            ),
          { timeout: 30_000 },
        )
        .toBe(false);
      await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible();
    }

    const bounced = results.filter((r) => r.bounces.length > 0).length;
    console.log(`BOUNCE-SUMMARY ${name}: ${bounced}/${results.length} gestures bounced`);
    for (const r of results) {
      expect.soft(r.bounces, `gesture ${r.gesture}: bounced`).toEqual([]);
      expect
        .soft(r.textMovedDown, `gesture ${r.gesture}: the wheel scrolled up`)
        .toBeGreaterThan(100);
      expect
        .soft(r.stillDrift, `gesture ${r.gesture}: moved after the gesture`)
        .toBeLessThanOrEqual(0.5);
    }
    // The stay-put window means something only while the reply still grows below it.
    expect(results.filter((r) => r.grewWhileStill > 0).length).toBeGreaterThanOrEqual(
      Math.ceil(results.length / 2),
    );
  });
}
