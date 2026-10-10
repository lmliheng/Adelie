/**
 * Admin storage ledger route (admin only, 403 `admin_required` for a non-admin), exactly like
 * the server-settings route beside it:
 * GET /api/admin/storage — the report on what the data root holds, class by class, with the
 * entries a person could review.
 *
 * One method and no request at all: there is no PUT and no DELETE here, and deliberately no
 * query parameter either, because a parameter naming a class, a path or a policy would be the
 * beginning of an instruction a caller could send — and a report's whole value is that reading
 * it decides nothing. The work itself is services/storage-service.ts, which only reads.
 */
import { Hono } from "hono";
import type { StorageReportResponse } from "../../api/types.js";
import { HttpError } from "../errors.js";
import type { AppEnv } from "../../auth/middleware.js";
import type { StorageLedgerReader } from "../../services/storage-service.js";

/** What this route group reaches — bound by AdminRoutes, which builds it (src/http/routes/admin.ts). */
export interface AdminStorageRouteDeps {
  storage: StorageLedgerReader;
}

export function adminStorageRoutes(deps: AdminStorageRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    if (!c.var.user.isAdmin) {
      throw new HttpError(403, "admin_required", "Only an admin can perform this operation.");
    }
    await next();
  });

  app.get("/", async (c) =>
    c.json({ report: await deps.storage.report() } satisfies StorageReportResponse),
  );

  return app;
}
