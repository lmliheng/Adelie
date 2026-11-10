/**
 * The machines generation's lifetime: what start() installs while this App lives, and what a
 * retired generation must not install afterwards.
 *
 * The re-hold timer is the reason this file exists. start() reaches out over the network
 * before it settles, so a hot push's stop() (the platform's dispose effect) can land while it
 * is still awaiting; a timer installed after that would never be cleared, and would read a
 * database that is already closed once a minute. The same leak reached the test suite: an
 * App's cleanup that did not call stop() left the timer reading a closed root.
 *
 * Scenarios:
 * - A generation that was never stopped re-holds on its own, once a minute.
 * - A stop() landing while start() is still reaching out installs no timer at all.
 * - A retired generation's start() reaches nothing, so a late caller cannot revive it.
 * - An App's cleanup retires its machines generation — a start() afterwards touches nothing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../src/db/database.js";
import { MachinesRepo } from "../src/db/repos/machines.js";
import { MachinesService } from "../src/machines/service.js";
import type { MachinesEffects } from "../src/machines/service.js";
import { remoteLayoutFor } from "../src/machines/layout.js";
import { createTestApp, makeTempRoot, waitFor } from "./helpers.js";

/** This machine's id; minted from the `machine` table in the real server, fixed here. */
const LOCAL_ID = "TESTlocalID00000";
/** KEEP_HELD_MS in machines/service.ts: how long a generation waits between re-hold sweeps. */
const KEEP_HELD_MS = 60_000;

describe("machines generation lifetime", () => {
  const open: Array<{ store: DatabaseSync; root: string }> = [];
  const services: MachinesService[] = [];

  afterEach(() => {
    vi.useRealTimers();
    for (const service of services.splice(0)) service.stop();
    for (const { store, root } of open.splice(0)) {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * A service over a fresh root and store, with only the reaching-out faked: one alias in the
   * ssh config, no build to hand over, and a counter for every read of that config — which is
   * what a re-hold sweep starts with.
   */
  const harness = async () => {
    const root = await makeTempRoot();
    const store = openDatabase(":memory:");
    open.push({ store, root });
    let reads = 0;
    const effects: Partial<MachinesEffects> = {
      listAliases: () => {
        reads += 1;
        return ["nas"];
      },
      resolvePlan: () => null,
      now: () => new Date("2026-08-24T12:00:00.000Z"),
    };
    const service = new MachinesService(
      root,
      LOCAL_ID,
      new MachinesRepo(store),
      effects,
      undefined,
      remoteLayoutFor("release"),
    );
    services.push(service);
    return { service, reads: () => reads };
  };

  it("a generation that is not stopped re-holds on its own, once a minute", async () => {
    vi.useFakeTimers();
    const built = await harness();
    await built.service.start();
    const afterBoot = built.reads();
    // The boot's own sweep read the config once — the control that makes the assertions below
    // about NOT reading anything meaningful.
    expect(afterBoot).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(KEEP_HELD_MS);
    expect(built.reads()).toBeGreaterThan(afterBoot);
  });

  it("a stop() landing while start() is still reaching out installs no re-hold timer", async () => {
    vi.useFakeTimers();
    const built = await harness();
    // start() runs synchronously up to its first await, so this stop() is the hot push that
    // arrives mid-sweep — the case the guard in start() is for.
    const started = built.service.start();
    built.service.stop();
    await started;

    const reads = built.reads();
    await vi.advanceTimersByTimeAsync(KEEP_HELD_MS * 3);
    expect(built.reads()).toBe(reads);
  });

  it("a retired generation's start() reaches nothing", async () => {
    const built = await harness();
    built.service.stop();
    await built.service.start();
    expect(built.reads()).toBe(0);
  });

  it("an App's cleanup retires its machines generation, so a late start() touches nothing", async () => {
    const built = await harness();
    // The App's boot calls start() itself (Startup.setup), as the real platform does.
    const app = await createTestApp({ machines: built.service });
    await waitFor(() => built.reads() > 0);
    await app.cleanup();

    const afterCleanup = built.reads();
    await built.service.start();
    expect(built.reads()).toBe(afterCleanup);
  });
});
