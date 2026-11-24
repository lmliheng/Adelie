/**
 * The window's own title bar relay: the /api/desktop/title-bar routes (the shell window's
 * sessions only), and the shell port they ride.
 *
 * - The status reads as null before the shell's first push, then as what it pushed; the page
 *   reads that null as "draw nothing", the honest answer for a shell still wearing its caption.
 * - A PUT forwards the two overlay colours to the shell and answers 202; a colour it cannot
 *   read, or a request asking for neither, is refused and reaches no shell.
 * - A password session against the same desktop server gets 403; with no shell wired the PUT
 *   answers 503; a plain server has no such route.
 * - Only a well-formed status frame is read; a shell that cannot say whether it handed the
 *   caption over is not one.
 * - Title-bar pushes and commands share one port with the other relays, none disturbing the
 *   others.
 */
import { describe, expect, it } from "vitest";
import { createDesktopApp, createTestApp, desktopLoginCookie, loginAdmin } from "./helpers.js";
import type {
  DesktopTitleBarPatch,
  DesktopTitleBarStatusResponse,
  ErrorBody,
} from "../src/api/types.js";
import { DesktopService } from "../src/services/desktop-service.js";
import {
  parseTitleBarStatusMessage,
  wireShellUpdatePort,
} from "../src/services/desktop-update-port.js";
import { FakePort } from "./builtin-browser/fake-shell.js";

const put = (cookie: string, body: string) => ({
  method: "PUT",
  headers: { cookie, "content-type": "application/json" },
  body,
});

describe("GET /api/desktop/title-bar", () => {
  it("serves null before the shell's first push, then the stored status", async () => {
    const t = await createDesktopApp();
    try {
      const cookie = await desktopLoginCookie(t.app);
      const before = await t.app.request("/api/desktop/title-bar", { headers: { cookie } });
      expect(before.status).toBe(200);
      expect((await before.json()) as DesktopTitleBarStatusResponse).toEqual({ status: null });

      t.deps.desktop!.setTitleBarStatus({ enabled: true, height: 32 });
      const after = await t.app.request("/api/desktop/title-bar", { headers: { cookie } });
      expect((await after.json()) as DesktopTitleBarStatusResponse).toEqual({
        status: { enabled: true, height: 32 },
      });
    } finally {
      await t.cleanup();
    }
  });

  it("answers 403 desktop_shell_only to a password-established session", async () => {
    const t = await createDesktopApp();
    try {
      const admin = await loginAdmin(t.app);
      const res = await t.app.request("/api/desktop/title-bar", {
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
      const res = await t.app.request("/api/desktop/title-bar", {
        headers: { cookie: admin.cookie },
      });
      expect(res.status).toBe(404);
    } finally {
      await t.cleanup();
    }
  });
});

describe("PUT /api/desktop/title-bar", () => {
  it("forwards both overlay colours to the registered shell sender and answers 202", async () => {
    const t = await createDesktopApp();
    try {
      const cookie = await desktopLoginCookie(t.app);
      const sent: DesktopTitleBarPatch[] = [];
      t.deps.desktop!.onTitleBarCommand((patch) => sent.push(patch));

      const both = await t.app.request(
        "/api/desktop/title-bar",
        put(cookie, '{"color":"rgb(20, 20, 20)","symbolColor":"#eee"}'),
      );
      expect(both.status).toBe(202);
      // A theme change re-colours one thing: a command naming a single colour is a valid one.
      const one = await t.app.request(
        "/api/desktop/title-bar",
        put(cookie, '{"symbolColor":"#fff"}'),
      );
      expect(one.status).toBe(202);
      expect(sent).toEqual([
        { color: "rgb(20, 20, 20)", symbolColor: "#eee" },
        { symbolColor: "#fff" },
      ]);
    } finally {
      await t.cleanup();
    }
  });

  it("refuses a colour it cannot read, and a request that asks for nothing", async () => {
    const t = await createDesktopApp();
    try {
      const cookie = await desktopLoginCookie(t.app);
      const sent: DesktopTitleBarPatch[] = [];
      t.deps.desktop!.onTitleBarCommand((patch) => sent.push(patch));
      const cases: Array<[string, string]> = [
        ['{"color":""}', "invalid_title_bar_color"],
        ['{"color":"   "}', "invalid_title_bar_color"],
        ['{"color":12}', "invalid_title_bar_color"],
        ['{"symbolColor":"  "}', "invalid_title_bar_symbol_color"],
        ['{"symbolColor":true}', "invalid_title_bar_symbol_color"],
        // Nothing to do is a caller bug, not a no-op worth waking the shell for. An unparseable
        // body lands here too: it asks for nothing this route understands.
        ["{}", "empty_title_bar_patch"],
        ["not json", "empty_title_bar_patch"],
      ];
      for (const [body, code] of cases) {
        const res = await t.app.request("/api/desktop/title-bar", put(cookie, body));
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
        "/api/desktop/title-bar",
        put(admin.cookie, '{"color":"#000"}'),
      );
      expect(forbidden.status).toBe(403);

      const cookie = await desktopLoginCookie(t.app);
      const unreachable = await t.app.request(
        "/api/desktop/title-bar",
        put(cookie, '{"color":"#000"}'),
      );
      expect(unreachable.status).toBe(503);
      expect(((await unreachable.json()) as ErrorBody).error.code).toBe("shell_unreachable");
    } finally {
      await t.cleanup();
    }
  });
});

describe("the title-bar half of the shell port", () => {
  it("parses only well-formed status frames", () => {
    expect(
      parseTitleBarStatusMessage({
        type: "desktop-titlebar-status",
        status: { enabled: true, height: 32 },
      }),
    ).toEqual({ enabled: true, height: 32 });
    // A disabled status is the truth too: the shell has its native caption and the page draws
    // nothing under it.
    expect(
      parseTitleBarStatusMessage({
        type: "desktop-titlebar-status",
        status: { enabled: false, height: 32 },
      }),
    ).toEqual({ enabled: false, height: 32 });
    for (const data of [
      null,
      "status",
      {},
      { type: "desktop-titlebar-status" },
      { type: "desktop-titlebar-status", status: null },
      { type: "desktop-titlebar-status", status: { enabled: true } },
      { type: "desktop-titlebar-status", status: { height: 32 } },
      { type: "desktop-titlebar-status", status: { enabled: "yes", height: 32 } },
      { type: "desktop-titlebar-status", status: { enabled: true, height: "32" } },
      // The other relays ride the same port and must not be read as title-bar ones.
      { type: "desktop-tray-status", status: { showTrayIcon: true, locale: "zh" } },
      { type: "desktop-pet-status", status: { showPet: true } },
    ]) {
      expect(parseTitleBarStatusMessage(data)).toBeNull();
    }
  });

  it("stores title-bar pushes and posts commands beside the other relays, on one port", () => {
    const desktop = new DesktopService("t");
    const port = new FakePort();
    wireShellUpdatePort(desktop, port);

    port.emit({ type: "desktop-titlebar-status", status: { enabled: true, height: 32 } });
    expect(desktop.getTitleBarStatus()).toEqual({ enabled: true, height: 32 });
    // A pet frame on the same port leaves the title-bar status alone, and vice versa.
    port.emit({ type: "desktop-pet-status", status: { showPet: true } });
    expect(desktop.getTitleBarStatus()).toEqual({ enabled: true, height: 32 });
    expect(desktop.getPetStatus()).toEqual({ showPet: true });

    expect(desktop.requestTitleBarCommand({ color: "#111", symbolColor: "#fff" })).toBe(true);
    expect(port.sent).toEqual([
      { type: "desktop-titlebar-command", color: "#111", symbolColor: "#fff" },
    ]);
  });
});
