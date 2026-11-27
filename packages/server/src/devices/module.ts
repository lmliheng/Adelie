/**
 * The device feature's place in the platform tree.
 *
 * One component does the wiring, because the pieces call each other: the hub accepts frames
 * from bridges and hands them to the service; the service asks the hub to run commands and to
 * push a revoked permission. Both are disposed with this generation, so a hot swap hands the
 * pipe to the next generation's listener instead of leaving two (the same reason the built-in
 * browser disposes its port).
 *
 * The socket is the local channel only (design §4.3): a remote bridge over WSS is the
 * companion line's work, and a pairing token exists in the schema for it — nothing here opens
 * a port.
 */
import type { DatabaseSync } from "node:sqlite";
import { Bind, Component, Module, Use } from "@adelie/core/kernel";
import type { ClassCtx } from "@adelie/core/kernel";
import type { Hono } from "hono";
import type { AppEnv } from "../auth/middleware.js";
import type { Db, Log, Paths } from "../hmr/capabilities.js";
import type { Access } from "../mechanisms/projects.js";
import { ensureInstallId } from "../install-id.js";
import { DevicesRepo } from "../db/repos/devices.js";
import { devicesRoutes } from "../http/routes/devices.js";
import { DeviceAudit } from "./audit.js";
import { BridgeHub } from "./bridges.js";
import { DevicesService } from "./service.js";
import { SnapshotStore } from "./snapshot-store.js";

@Component({
  contributes: {
    "HttpModule.routes": [
      {
        id: "DeviceRoutes.routes",
        prefix: "/api/projects/:projectId/devices",
        auth: "user",
        order: 60,
      },
    ],
  },
})
export class DeviceRoutes {
  @Use() private readonly paths!: Paths;
  @Use() private readonly db!: Db;
  @Use() private readonly log!: Log;
  @Use() private readonly access!: Access;
  @Bind("DeviceRoutes.routes") routes!: Hono<AppEnv>;

  setup({ effect }: ClassCtx) {
    const log = (line: string) => this.log.line(line);
    const repo = new DevicesRepo(this.db as unknown as DatabaseSync);
    const snapshots = new SnapshotStore(this.paths.root);
    const audit = new DeviceAudit(repo);
    const service = new DevicesService(repo, snapshots, audit, log);
    const hub = new BridgeHub(repo, service, {
      root: this.paths.root,
      installId: ensureInstallId(this.paths.root),
      log,
    });
    service.attachDispatcher(hub);
    hub.start();
    this.routes = devicesRoutes({ devices: service, access: this.access });
    effect(() => hub.dispose());
  }
}

/** Devices: the registry, the bridge pipe and the per-device permissions. */
@Module({
  children: [DeviceRoutes],
  exports: [],
})
export class DevicesModule {}
