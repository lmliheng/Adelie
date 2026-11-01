/**
 * The sign-in entry relay: the /api/desktop/login-item routes (the shell window's sessions only),
 * and the shell port they ride.
 *
 * - The status reads as null before the shell's first push, then as what it pushed — including the
 *   `supported: false` a non-Windows shell reports, which is not the same thing as silence.
 * - A PUT forwards the switch to the shell and answers 202; a field it cannot read, or a request
 *   that asks for nothing, is refused and reaches no shell.
 * - A password session against the same desktop server gets 403; with no shell wired the PUT
 *   answers 503; a plain server has no such route.
 * - Only a well-formed status frame is read, and the two fields are both required: this switch is
 *   the operating system's record, so a frame that cannot say whether it is even supported is
 *   dropped rather than half-read.
 */
import { describe, expect, it } from "vitest";
import { createDesktopApp, createTestApp, desktopLoginCookie, loginAdmin } from "./helpers.js";
import type {
  DesktopLoginItemPatch,
  DesktopLoginItemStatusResponse,
  ErrorBody,
} from "../src/api/types.js";
import { DesktopService } from "../src/services/desktop-service.js";
import {
  parseLoginItemStatusMessage,
  wireShellUpdatePort,
} from "../src/services/desktop-update-port.js";
import { FakePort } from "./builtin-browser/fake-shell.js";

const put = (cookie: string, body: string) => ({
  method: "PUT",
  headers: { cookie, "content-type": "application/json" },
  body,
});

describe("GET /api/desktop/login-item", () => {
  it("serves null before the shell's first push, then the stored status", async () => {
    const t = await createDesktopApp();
    try {
      const cookie = await desktopLoginCookie(t.app);
      const before = await t.app.request("/api/desktop/login-item", { headers: { cookie } });
      expect(before.status).toBe(200);
      expect((await before.json()) as DesktopLoginItemStatusResponse).toEqual({ status: null });

      t.deps.desktop!.setLoginItemStatus({ supported: true, openAtLogin: true });
      const after = await t.app.request("/api/desktop/login-item", { headers: { cookie } });
      expect((await after.json()) as DesktopLoginItemStatusResponse).toEqual({
        status: { supported: true, openAtLogin: true },
      });

      // A Linux or macOS shell answers with `supported: false` rather than by staying quiet: the
      // page draws no row for either, and the two are the same to it, but the difference is what
      // a person reading the API (or a future platform) needs.
      t.deps.desktop!.setLoginItemStatus({ supported: false, openAtLogin: false });
      const elsewhere = await t.app.request("/api/desktop/login-item", { headers: { cookie } });
      expect((await elsewhere.json()) as DesktopLoginItemStatusResponse).toEqual({
        status: { supported: false, openAtLogin: false },
      });
    } finally {
      await t.cleanup();
    }
  });

  it("answers 403 desktop_shell_only to a password-established session", async () => {
    const t = await createDesktopApp();
    try {
      const admin = await loginAdmin(t.app);
      const res = await t.app.request("/api/desktop/login-item", {
        headers: { cookie: admin.cookie },
      });
      expect(res.status).toBe(403);
      expect(((await res.json()) as ErrorBody).error.code).toBe("desktop_shell_only");
    } finally {
      await t.cleanup();
    }
  });

  it("does not exist outside desktop mode", async () => {
    const t = await createTestApp();
    try {
      const admin = await loginAdmin(t.app);
      const res = await t.app.request("/api/desktop/login-item", {
        headers: { cookie: admin.cookie },
      });
      expect(res.status).toBe(404);
    } finally {
      await t.cleanup();
    }
  });
});

describe("PUT /api/desktop/login-item", () => {
  it("forwards the switch to the registered shell sender and answers 202", async () => {
    const t = await createDesktopApp();
    try {
      const cookie = await desktopLoginCookie(t.app);
      const sent: DesktopLoginItemPatch[] = [];
      t.deps.desktop!.onLoginItemCommand((patch) => sent.push(patch));

      const on = await t.app.request(
        "/api/desktop/login-item",
        put(cookie, '{"openAtLogin":true}'),
      );
      expect(on.status).toBe(202);
      const off = await t.app.request(
        "/api/desktop/login-item",
        put(cookie, '{"openAtLogin":false}'),
      );
      expect(off.status).toBe(202);
      expect(sent).toEqual([{ openAtLogin: true }, { openAtLogin: false }]);
    } finally {
      await t.cleanup();
    }
  });

  it("refuses a field it cannot read, and a request that asks for nothing", async () => {
    const t = await createDesktopApp();
    try {
      const cookie = await desktopLoginCookie(t.app);
      const sent: DesktopLoginItemPatch[] = [];
      t.deps.desktop!.onLoginItemCommand((patch) => sent.push(patch));
      const cases: Array<[string, string]> = [
        ['{"openAtLogin":"on"}', "invalid_open_at_login"],
        ['{"openAtLogin":1}', "invalid_open_at_login"],
        ['{"openAtLogin":null}', "invalid_open_at_login"],
        // Nothing to do is a caller bug, not a no-op worth waking the shell for. An unparseable
        // body lands here too: it asks for nothing this route understands.
        ["{}", "empty_login_item_patch"],
        ["not json", "empty_login_item_patch"],
      ];
      for (const [body, code] of cases) {
        const res = await t.app.request("/api/desktop/login-item", put(cookie, body));
        expect(res.status, body).toBe(400);
        expect(((await res.json()) as ErrorBody).error.code, body).toBe(code);
      }
      expect(sent).toEqual([]);
    } finally {
      await t.cleanup();
    }
  });

  it("refuses a password session, and answers 503 while no port is wired", async () => {
    const t = await createDesktopApp();
    try {
      const admin = await loginAdmin(t.app);
      const forbidden = await t.app.request(
        "/api/desktop/login-item",
        put(admin.cookie, '{"openAtLogin":true}'),
      );
      expect(forbidden.status).toBe(403);

      const cookie = await desktopLoginCookie(t.app);
      const unreachable = await t.app.request(
        "/api/desktop/login-item",
        put(cookie, '{"openAtLogin":true}'),
      );
      expect(unreachable.status).toBe(503);
      expect(((await unreachable.json()) as ErrorBody).error.code).toBe("shell_unreachable");
    } finally {
      await t.cleanup();
    }
  });
});

describe("the login-item half of the shell port", () => {
  it("parses only well-formed status frames, with both fields present", () => {
    expect(
      parseLoginItemStatusMessage({
        type: "desktop-login-item-status",
        status: { supported: true, openAtLogin: false },
      }),
    ).toEqual({ supported: true, openAtLogin: false });
    expect(
      parseLoginItemStatusMessage({
        type: "desktop-login-item-status",
        status: { supported: false, openAtLogin: false },
      }),
    ).toEqual({ supported: false, openAtLogin: false });
    for (const data of [
      null,
      "status",
      {},
      { type: "desktop-login-item-status" },
      { type: "desktop-login-item-status", status: null },
      { type: "desktop-login-item-status", status: {} },
      { type: "desktop-login-item-status", status: { supported: true } },
      { type: "desktop-login-item-status", status: { openAtLogin: true } },
      { type: "desktop-login-item-status", status: { supported: true, openAtLogin: "yes" } },
      // The tray's frames ride the same port and must not be read as login-item ones.
      { type: "desktop-tray-status", status: { showTrayIcon: true, locale: "en" } },
    ]) {
      expect(parseLoginItemStatusMessage(data)).toBeNull();
    }
  });

  it("stores login-item pushes and posts its commands beside the others, on one port", () => {
    const desktop = new DesktopService("t");
    const port = new FakePort();
    wireShellUpdatePort(desktop, port);

    expect(desktop.getLoginItemStatus()).toBeNull();
    port.emit({
      type: "desktop-login-item-status",
      status: { supported: true, openAtLogin: true },
    });
    expect(desktop.getLoginItemStatus()).toEqual({ supported: true, openAtLogin: true });
    // A tray frame on the same port leaves the sign-in state alone, and vice versa.
    port.emit({ type: "desktop-tray-status", status: { showTrayIcon: false, locale: "zh" } });
    expect(desktop.getLoginItemStatus()).toEqual({ supported: true, openAtLogin: true });
    expect(desktop.getTrayStatus()).toEqual({ showTrayIcon: false, locale: "zh" });

    expect(desktop.requestLoginItemCommand({ openAtLogin: false })).toBe(true);
    expect(port.sent).toEqual([{ type: "desktop-login-item-command", openAtLogin: false }]);
  });
});
