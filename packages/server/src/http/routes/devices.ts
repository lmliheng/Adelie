/**
 * Device routes, under a Project: relative to `/api/projects/:projectId/devices`.
 *
 * GET    /                              — the devices this Project may use, the bridges, and
 *                                         what the bridge found on its machine (an ADB-less
 *                                         desktop says so here rather than showing an empty list).
 * GET    /:deviceId                     — one device with its snapshot and audit trail.
 * GET    /:deviceId/events?limit=       — the audit trail alone.
 * POST   /:deviceId/commands            — run one command; `approve: true` is the per-command
 *                                         consent every write capability requires.
 * PUT    /:deviceId/permissions         — grant or revoke one capability ON THIS DEVICE (admin).
 * POST   /:deviceId/grants              — allow another Project to use it (admin).
 * DELETE /:deviceId/grants/:projectId   — take that back (admin).
 * DELETE /:deviceId                     — forget it (admin). The audit rows stay.
 *
 * Devices are instance-level (design §6): the Project in the path decides WHAT you may see
 * and use, never where the device lives. Permission changes are an admin's: they decide what
 * any agent in any Project may do to somebody's phone.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { isCapability } from "@adelie/device";
import type {
  DeviceCommandResponse,
  DeviceDetailResponse,
  DeviceEventListResponse,
  DeviceGrantsResponse,
  DevicePermissionResponse,
  DevicesResponse,
} from "../../api/types.js";
import { HttpError } from "../errors.js";
import { requireValidId } from "../validate.js";
import type { AppEnv } from "../../auth/middleware.js";
import type { Access } from "../../mechanisms/projects.js";
import { DeviceError, type DevicesService } from "../../devices/service.js";

export interface DevicesRouteDeps {
  devices: DevicesService;
  access: Access;
}

/** Maps the service's typed refusals onto the shared HTTP error contract. */
function httpError(err: unknown): never {
  if (err instanceof DeviceError) throw new HttpError(err.status, err.code, err.message);
  throw err;
}

export function devicesRoutes(deps: DevicesRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Any member of the Project may look; the Project scope decides WHICH devices answer.
  app.use("*", async (c, next) => {
    deps.access.requireProjectAccess(c.var.user.userId, requireValidId(c, "projectId"));
    await next();
  });

  const actor = (c: Context<AppEnv>): string => c.var.user.userId;

  const requireAdmin = (c: Context<AppEnv>, what: string): void => {
    if (!c.var.user.isAdmin) {
      throw new HttpError(403, "admin_required", `Only an admin can ${what}.`);
    }
  };

  const user = (c: Context<AppEnv>) => ({
    userId: c.var.user.userId,
    isAdmin: c.var.user.isAdmin,
  });

  app.get("/", (c) => {
    const projectId = requireValidId(c, "projectId");
    const state = deps.devices.list(projectId, user(c));
    return c.json({ ...state } satisfies DevicesResponse);
  });

  app.get("/:deviceId", (c) => {
    const projectId = requireValidId(c, "projectId");
    const deviceId = requireValidId(c, "deviceId");
    const detail = deps.devices.detail(deviceId, projectId, user(c));
    return c.json({ ...detail } satisfies DeviceDetailResponse);
  });

  app.get("/:deviceId/events", (c) => {
    const projectId = requireValidId(c, "projectId");
    const deviceId = requireValidId(c, "deviceId");
    const raw = Number.parseInt(c.req.query("limit") ?? "", 10);
    const limit = Number.isFinite(raw) ? raw : undefined;
    return c.json({
      events: deps.devices.events(deviceId, projectId, user(c), limit),
    } satisfies DeviceEventListResponse);
  });

  app.post("/:deviceId/commands", async (c) => {
    const projectId = requireValidId(c, "projectId");
    const deviceId = requireValidId(c, "deviceId");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (body === null) throw new HttpError(400, "bad_request", "A command body is required.");
    try {
      const result = await deps.devices.issue(
        deviceId,
        { op: body.op, args: body.args, approve: body.approve },
        actor(c),
        projectId,
        user(c),
      );
      return c.json({ ...result } satisfies DeviceCommandResponse);
    } catch (err) {
      httpError(err);
    }
  });

  app.put("/:deviceId/permissions", async (c) => {
    requireAdmin(c, "change what may be done to a phone");
    const projectId = requireValidId(c, "projectId");
    const deviceId = requireValidId(c, "deviceId");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (body === null || typeof body.capability !== "string" || typeof body.allowed !== "boolean") {
      throw new HttpError(400, "bad_request", "Send { capability, allowed }.");
    }
    if (!isCapability(body.capability)) {
      throw new HttpError(400, "bad_request", `Unknown capability ${body.capability}.`);
    }
    try {
      const device = deps.devices.setPermission(
        deviceId,
        body.capability,
        body.allowed,
        actor(c),
        projectId,
      );
      return c.json({ device } satisfies DevicePermissionResponse);
    } catch (err) {
      httpError(err);
    }
  });

  app.post("/:deviceId/grants", async (c) => {
    requireAdmin(c, "grant a device to another Project");
    const projectId = requireValidId(c, "projectId");
    const deviceId = requireValidId(c, "deviceId");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (body === null || typeof body.projectId !== "string" || body.projectId.trim() === "") {
      throw new HttpError(400, "bad_request", "Send { projectId }.");
    }
    deps.devices.grant(deviceId, body.projectId, actor(c));
    return c.json(
      { grants: deps.devices.grants(deviceId, projectId, user(c)) } satisfies DeviceGrantsResponse,
      201,
    );
  });

  // The target Project is `targetProjectId`: `projectId` is already the path this route sits under.
  app.delete("/:deviceId/grants/:targetProjectId", (c) => {
    requireAdmin(c, "take a device away from a Project");
    const projectId = requireValidId(c, "projectId");
    const deviceId = requireValidId(c, "deviceId");
    deps.devices.revokeGrant(deviceId, requireValidId(c, "targetProjectId"), actor(c));
    return c.json({
      grants: deps.devices.grants(deviceId, projectId, user(c)),
    } satisfies DeviceGrantsResponse);
  });

  app.delete("/:deviceId", (c) => {
    requireAdmin(c, "forget a device");
    try {
      deps.devices.forget(requireValidId(c, "deviceId"), actor(c));
    } catch (err) {
      httpError(err);
    }
    return c.body(null, 204);
  });

  return app;
}
