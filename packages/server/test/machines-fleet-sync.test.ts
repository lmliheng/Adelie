/**
 * The whole-fleet push's escaped failures (machines/service.ts syncModelsEverywhere).
 *
 * The push is fired and forgotten — the models PUT, the default switch and a plugin change
 * all `void` it, because the person editing a key should not wait for a set of ssh tunnels.
 * Its per-machine failures were already swallowed (the connect log is where a sync's own
 * words go), but the reads in front of them were not: `list()` asks each alias for its live
 * session, and a transport throwing there rejected a promise nobody holds. The process then
 * filed it as a bare `unhandled_rejection` — a message that named neither the Project whose
 * edit asked for the push nor the step that failed.
 *
 * Scenarios:
 * - A push whose machine list cannot be read is recorded as fleet_sync_failed, with the Project.
 * - The caller's own promise still resolves: nothing new is thrown at anyone.
 * - A connected machine whose sync fails on its own stays silent here (best effort, one level down).
 * - A push that reaches no connected machine records nothing.
 * - The record shape carries the Project only when one asked for the work.
 *
 * Only the reaching-out is faked, the way machines-lifecycle.test.ts does it: the logic
 * under test is what happens around it.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../src/db/database.js";
import { MachinesRepo } from "../src/db/repos/machines.js";
import { MachinesService, machinesErrorRecord } from "../src/machines/service.js";
import type { MachinesEffects } from "../src/machines/service.js";
import { remoteLayoutFor } from "../src/machines/layout.js";
import type { ShellSession } from "../src/machines/transport/index.js";
import { makeTempRoot } from "./helpers.js";

/** This machine's id; minted from the `machine` table in the real server, fixed here. */
const LOCAL_ID = "TESTlocalID00000";

describe("the whole-fleet push's escapes", () => {
  const open: Array<{ store: DatabaseSync; root: string }> = [];
  const services: MachinesService[] = [];

  afterEach(() => {
    for (const service of services.splice(0)) service.stop();
    for (const { store, root } of open.splice(0)) {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * A service over a fresh root and store, with only the reaching-out faked. `reported` is
   * everything the service would have handed the error centre, in order.
   */
  const harness = async (effects: Partial<MachinesEffects>) => {
    const root = await makeTempRoot();
    const store = openDatabase(":memory:");
    open.push({ store, root });
    // A membership follows its Project out (the foreign key), so the store needs the rows.
    store
      .prepare(
        "INSERT INTO users (user_id, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)",
      )
      .run("admin", "x", "2026-11-11T00:00:00.000Z");
    store
      .prepare("INSERT INTO projects (project_id, owner_user_id, created_at) VALUES (?, ?, ?)")
      .run("proj-a", "admin", "2026-11-11T00:00:00.000Z");
    const reported: Array<{ err: unknown; code: string; projectId?: string }> = [];
    const repo = new MachinesRepo(store);
    const service = new MachinesService(
      root,
      LOCAL_ID,
      repo,
      {
        listAliases: () => [],
        resolvePlan: () => null,
        now: () => new Date("2026-11-11T00:00:00.000Z"),
        recordError: (err, code, projectId) => {
          reported.push({ err, code, projectId });
        },
        ...effects,
      },
      undefined,
      remoteLayoutFor("release"),
    );
    services.push(service);
    return { service, repo, reported };
  };

  it("records a push whose machine list cannot be read, under the Project that asked", async () => {
    // The transport is the reachable version of this: `list()` asks it for the session held
    // to an alias, and one that throws takes the whole push down with it.
    const boom = new Error("the ssh session closed underneath the read");
    const { service, reported } = await harness({
      listAliases: () => ["nas"],
      session: () => {
        throw boom;
      },
    });

    await expect(service.syncModelsEverywhere("proj-a")).resolves.toBeUndefined();

    expect(reported).toHaveLength(1);
    expect(reported[0]).toEqual({ err: boom, code: "fleet_sync_failed", projectId: "proj-a" });
  });

  it("raises nothing at a caller that discards the promise — the shape all three real callers have", async () => {
    const { service, reported } = await harness({
      listAliases: () => ["nas"],
      session: () => {
        throw new Error("the ssh session closed underneath the read");
      },
    });

    // `void` is what models.ts (twice) and plugins-installed.ts actually do. A rejection that
    // escaped would reach vitest as an unhandled rejection and fail this file — which is
    // precisely the pre-change shape, and what the catch is here to keep off the process.
    void service.syncModelsEverywhere("proj-a");
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(reported.map((r) => r.code)).toEqual(["fleet_sync_failed"]);
  });

  it("stays silent when a connected machine's own sync fails: that is best effort, one level down", async () => {
    // A held connection and an installed record put the machine past `list()`'s filter; the
    // minted session then fails, which is the per-machine catch's case, not this one's.
    const { service, repo, reported } = await harness({
      listAliases: () => ["nas"],
      session: () => ({ pid: 4242 }) as unknown as ShellSession,
      mintToken: async () => ({ kind: "failed" as const, detail: "no login" }),
    });
    repo.patch("ssh:nas", {
      version: "0.6.0",
      installedAt: "2026-11-01T00:00:00.000Z",
      remotePort: 9000,
    });
    repo.setMembers("proj-a", ["ssh:nas"]);

    await service.syncModelsEverywhere("proj-a");

    expect(reported).toEqual([]);
  });

  it("records nothing when the push reaches no connected machine", async () => {
    const { service, reported } = await harness({ listAliases: () => ["nas"] });

    await service.syncModelsEverywhere("proj-a");

    expect(reported).toEqual([]);
  });

  it("files the Project only when one asked for the work", () => {
    const err = new Error("x");

    expect(machinesErrorRecord(err, "fleet_sync_failed", "proj-a")).toEqual({
      source: "process",
      err,
      code: "fleet_sync_failed",
      ctx: { projectId: "proj-a" },
    });
    // The standing-intent timer's sweeps: no Project asked, and this is the record the boot
    // path in platform.ts writes for the same failure.
    expect(machinesErrorRecord(err, "machines_reconnect_failed")).toEqual({
      source: "process",
      err,
      code: "machines_reconnect_failed",
      ctx: undefined,
    });
  });
});
