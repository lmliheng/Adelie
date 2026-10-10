/**
 * Admin storage routes (admin only, 403 `admin_required` for a non-admin), exactly like the
 * server-settings route beside them:
 *
 * - `GET /api/admin/storage` — the ledger: what the data root holds, class by class, with the
 *   entries a person could review. Reads only, always available.
 * - `GET|PUT /api/admin/storage/settings` — the cleanup mode (off until somebody turns it on),
 *   the trash retention, and the pins.
 * - `POST /api/admin/storage/plans` — scans and writes a bill; `GET .../plans` lists the recent
 *   ones and `GET .../plans/:planId` reads one; `POST .../plans/:planId/pin` keeps an entry out
 *   of every future bill.
 * - `POST /api/admin/storage/apply` — moves the approved entries into the trash. The only route
 *   in this file that changes the data root, and it needs a plan id, that plan's fingerprint and
 *   an explicit path list.
 * - `GET /api/admin/storage/trash`, `POST .../trash/restore`, `POST .../trash/purge` — what a
 *   run moved, putting it back, and the one deletion there is.
 *
 * Nothing here runs on a timer, and no route accepts a policy: a caller cannot widen what a
 * scan considers, and cannot ask for "everything unreferenced" — the unit of approval is a
 * specific bill. The work itself is services/storage-service.ts.
 */
import { Hono } from "hono";
import type {
  StorageApplyResponse,
  StorageApplyRequest,
  StoragePinRequest,
  StoragePlanResponse,
  StoragePlansResponse,
  StoragePurgeResponse,
  StorageReportResponse,
  StorageRestoreResponse,
  StorageSettingsResponse,
  StorageTrashResponse,
} from "../../api/types.js";
import { HttpError } from "../errors.js";
import type { AppEnv } from "../../auth/middleware.js";
import {
  optionalBoolean,
  optionalNumber,
  optionalStringArray,
  pathParam,
  readJson,
  requireString,
} from "../validate.js";
import type { StorageAdmin } from "../../services/storage-service.js";

/** What this route group reaches — bound by AdminRoutes, which builds it (src/http/routes/admin.ts). */
export interface AdminStorageRouteDeps {
  storage: StorageAdmin;
}

export function adminStorageRoutes(deps: AdminStorageRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    if (!c.var.user.isAdmin) {
      throw new HttpError(403, "admin_required", "Only an admin can perform this operation.");
    }
    await next();
  });

  const settings = (): StorageSettingsResponse => ({ settings: deps.storage.settings() });

  app.get("/", async (c) =>
    c.json({ report: await deps.storage.report() } satisfies StorageReportResponse),
  );

  app.get("/settings", (c) => c.json(settings()));

  app.put("/settings", async (c) => {
    const body = await readJson(c);
    // Validated before anything is written, like the server-settings route: a PUT that names one
    // bad field leaves the mode, the retention and the pins exactly as they were.
    const enabled = optionalBoolean(body, "enabled");
    const trashTtlDays = optionalNumber(body, "trashTtlDays", {
      integer: true,
      nonNegative: true,
      label: "trashTtlDays",
    });
    const pins = optionalStringArray(body, "pins");
    return c.json({
      settings: deps.storage.updateSettings({
        ...(enabled !== undefined ? { enabled } : {}),
        ...(trashTtlDays !== undefined ? { trashTtlDays } : {}),
        ...(pins !== undefined ? { pins } : {}),
      }),
    } satisfies StorageSettingsResponse);
  });

  app.get("/plans", async (c) =>
    c.json({ plans: await deps.storage.plans() } satisfies StoragePlansResponse),
  );

  // A scan writes a bill and nothing else — it is a POST because it creates a file, not because
  // it changes anything a person would have to be warned about.
  app.post("/plans", async (c) =>
    c.json({ plan: await deps.storage.scan() } satisfies StoragePlanResponse, 201),
  );

  app.get("/plans/:planId", async (c) =>
    c.json({ plan: await deps.storage.plan(pathParam(c, "planId")) } satisfies StoragePlanResponse),
  );

  app.post("/plans/:planId/pin", async (c) => {
    const planId = pathParam(c, "planId");
    const body = await readJson(c);
    // The plan is read first so that pinning an entry of a plan that does not exist — a typo in
    // the id, a plan file deleted by hand — is told so rather than answered with a settings blob.
    await deps.storage.plan(planId);
    const request: StoragePinRequest = {
      path: requireString(body, "path", { label: "path" }),
      pinned: optionalBoolean(body, "pinned") ?? true,
    };
    return c.json({ settings: await deps.storage.pin(request) } satisfies StorageSettingsResponse);
  });

  app.post("/apply", async (c) => {
    const body = await readJson(c);
    // The selection is a list of paths and nothing else: there is no "all" and no class to name,
    // so what moves is exactly what somebody ticked on a bill they were reading.
    const request: StorageApplyRequest = {
      planId: requireString(body, "planId", { label: "planId" }),
      fingerprint: requireString(body, "fingerprint", { label: "fingerprint" }),
      paths: optionalStringArray(body, "paths") ?? [],
    };
    return c.json((await deps.storage.apply(request)) satisfies StorageApplyResponse);
  });

  app.get("/trash", async (c) =>
    c.json({
      entries: await deps.storage.trash(),
      ttlDays: deps.storage.settings().trashTtlDays,
    } satisfies StorageTrashResponse),
  );

  app.post("/trash/restore", async (c) => {
    const body = await readJson(c);
    const id = requireString(body, "id", { label: "id" });
    return c.json((await deps.storage.restore(id)) satisfies StorageRestoreResponse);
  });

  // Without an id this removes only what is past the retention, which is why the body may be
  // empty; with one it removes exactly that entry, which is how a person empties the trash of
  // one run they are done with.
  app.post("/trash/purge", async (c) => {
    const body = await readJson(c);
    const id = typeof body.id === "string" ? body.id : null;
    return c.json((await deps.storage.purge(id)) satisfies StoragePurgeResponse);
  });

  return app;
}
