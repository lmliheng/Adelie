/**
 * Admin notices: an admin writes them, every account reads its own inbox.
 *
 * - `GET /api/notifications` — this account's inbox: the global notices and its own, newest
 *   first, with the unread count the account menu's badge shows. Every signed-in account's.
 * - `POST /api/notifications/:id/read` — mark one read; 404 for an id this account cannot see.
 * - `POST /api/notifications/read-all` — mark every unread one read. Both answer with the whole
 *   inbox as it stands afterwards, so the reader never has to keep its own copy of the rules
 *   ("which rows does this account see") to update a list.
 * - `GET /api/admin/notifications` — what this server has sent, newest first, with a read count
 *   per notice and the length limits the compose form shows. Admin only.
 * - `POST /api/admin/notifications` — send one. Admin only.
 * - `DELETE /api/admin/notifications/:id` — withdraw one from every inbox. Admin only.
 *
 * Both prefixes are one feature and one component: the sender's side and the reader's side are the
 * same two tables, and a second component would be a second place for the audience rule (every
 * account, or the one named) to be written.
 *
 * The admin surface is refused in desktop mode (single-user: there is nobody to notify) and
 * answers a non-admin 403 `admin_required`, exactly like the user backend beside it. Nothing here
 * is a per-Project fact: a notice belongs to the account, which is why these routes sit outside
 * every Project's authorization.
 */
import { Hono } from "hono";
import type {
  AdminNotificationResponse,
  AdminNotificationsResponse,
  NotificationsResponse,
  NotificationScope,
} from "../../api/types.js";
import { HttpError } from "../errors.js";
import { rejectInDesktopMode } from "./desktop.js";
import type { DesktopService } from "../../services/desktop-service.js";
import type { AppEnv } from "../../auth/middleware.js";
import { positiveIntParam, readJson, requireEnum, requireString } from "../validate.js";
import { Bind, Component, Use } from "@adelie/core/kernel";
import type { Desktop } from "../../hmr/capabilities.js";
import type { Notifications } from "../../mechanisms/notifications.js";
import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_TITLE_MAX,
} from "../../services/notification-service.js";

/** The two scopes a notice can be sent with (the wire spelling of NotificationScope). */
const NOTIFICATION_SCOPES = ["global", "user"] as const;

/** What the reader's route group reaches. */
export interface NotificationsRouteDeps {
  notifications: Notifications;
}

/** What the admin's route group reaches. */
export interface AdminNotificationsRouteDeps extends NotificationsRouteDeps {
  desktop: DesktopService | null;
}

export function notificationRoutes(deps: NotificationsRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", (c) =>
    c.json(deps.notifications.inbox(c.var.user.userId) satisfies NotificationsResponse),
  );

  app.post("/:id/read", (c) => {
    const id = positiveIntParam(c, "id");
    if (!deps.notifications.markRead(c.var.user.userId, id)) throw notFound(id);
    return c.json(deps.notifications.inbox(c.var.user.userId) satisfies NotificationsResponse);
  });

  app.post("/read-all", (c) => {
    deps.notifications.markAllRead(c.var.user.userId);
    return c.json(deps.notifications.inbox(c.var.user.userId) satisfies NotificationsResponse);
  });

  return app;
}

export function adminNotificationRoutes(deps: AdminNotificationsRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", rejectInDesktopMode(deps));
  app.use("*", async (c, next) => {
    if (!c.var.user.isAdmin) {
      throw new HttpError(403, "admin_required", "Only an admin can perform this operation.");
    }
    await next();
  });

  app.get("/", (c) => c.json(deps.notifications.sent() satisfies AdminNotificationsResponse));

  app.post("/", async (c) => {
    const body = await readJson(c);
    const scope = requireEnum(body, "scope", NOTIFICATION_SCOPES, "scope");
    // The length limits are the server's (see services/notification-service.ts) and are refused
    // BEFORE anything is stored: a notice that is too long is not truncated into something the
    // sender did not write, and the reader never gets half of it.
    const title = requireText(body, "title", NOTIFICATION_TITLE_MAX);
    const text = requireText(body, "body", NOTIFICATION_BODY_MAX);
    if (scope === "global" && body.userId !== undefined) {
      throw new HttpError(
        400,
        "bad_request",
        "A global notice is addressed to every account; leave userId out.",
      );
    }
    const userId =
      scope === "user" ? requireString(body, "userId", { label: "userId", minLen: 1 }) : undefined;
    // The target account is checked by the service, which is where the audience rule lives.
    return c.json(
      {
        notification: deps.notifications.send({
          scope,
          ...(userId !== undefined ? { userId } : {}),
          title,
          body: text,
          sentBy: c.var.user.userId,
        }),
      } satisfies AdminNotificationResponse,
      201,
    );
  });

  app.delete("/:id", (c) => {
    const id = positiveIntParam(c, "id");
    if (!deps.notifications.remove(id)) throw notFound(id);
    return c.body(null, 204);
  });

  return app;
}

/** A blank title or body is refused rather than stored: a notice nobody can read says nothing. */
function requireText(body: Record<string, unknown>, key: string, maxLen: number): string {
  const value = requireString(body, key, { label: key, minLen: 1, maxLen });
  if (value.trim() === "") throw new HttpError(400, "bad_request", `${key} must not be blank.`);
  return value.trim();
}

function notFound(id: number): HttpError {
  return new HttpError(404, "notification_not_found", `No notice ${id} for this account.`);
}

@Component({
  contributes: {
    "HttpModule.routes": [
      { id: "notifications.routes", prefix: "/api/notifications", auth: "user", order: 62 },
      {
        id: "admin-api.notifications",
        prefix: "/api/admin/notifications",
        auth: "user",
        order: 55,
      },
    ],
  },
})
export class NotificationsRoutes {
  @Use() private readonly notifications!: Notifications;
  @Use() private readonly desktop!: Desktop;
  @Bind("notifications.routes") inboxRoutes!: Hono<AppEnv>;
  @Bind("admin-api.notifications") adminRoutes!: Hono<AppEnv>;
  setup() {
    this.inboxRoutes = notificationRoutes({ notifications: this.notifications });
    this.adminRoutes = adminNotificationRoutes({
      notifications: this.notifications,
      desktop: this.desktop.current() as DesktopService | null,
    });
  }
}
