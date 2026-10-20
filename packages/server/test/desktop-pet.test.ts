/**
 * The pet-window preference relay: the /api/desktop/pet routes (the shell window's sessions
 * only), and the shell port they ride.
 *
 * - The pet state reads as null before the shell's first push, then as what it pushed.
 * - A PUT forwards the switch to the shell and answers 202; a field it cannot read, or a
 *   request that asks for nothing, is refused and reaches no shell.
 * - A password session against the same desktop server gets 403; with no shell wired the PUT
 *   answers 503; a plain server has no such route.
 * - Only a well-formed pet frame is read; the updater's and the tray's frames on the same port
 *   are not pet frames.
 * - Pet pushes and pet commands share one port with the other two relays, none disturbing the
 *   others.
 */
import { describe, expect, it } from "vitest";
import { createDesktopApp, createTestApp, desktopLoginCookie, loginAdmin } from "./helpers.js";
import type { DesktopPetPatch, DesktopPetStatusResponse, ErrorBody } from "../src/api/types.js";
import { DesktopService } from "../src/services/desktop-service.js";
import { parsePetStatusMessage, wireShellUpdatePort } from "../src/services/desktop-update-port.js";
import { FakePort } from "./builtin-browser/fake-shell.js";

const put = (cookie: string, body: string) => ({
  method: "PUT",
  headers: { cookie, "content-type": "application/json" },
  body,
});

describe("GET /api/desktop/pet", () => {
  it("serves null before the shell's first push, then the stored state", async () => {
    const t = await createDesktopApp();
    try {
      const cookie = await desktopLoginCookie(t.app);
      const before = await t.app.request("/api/desktop/pet", { headers: { cookie } });
      expect(before.status).toBe(200);
      expect((await before.json()) as DesktopPetStatusResponse).toEqual({ status: null });

      t.deps.desktop!.setPetStatus({ showPet: true });
      const after = await t.app.request("/api/desktop/pet", { headers: { cookie } });
      expect((await after.json()) as DesktopPetStatusResponse).toEqual({
        status: { showPet: true },
      });
    } finally {
      await t.cleanup();
    }
  });

  it("answers 403 desktop_shell_only to a password-established session", async () => {
    const t = await createDesktopApp();
    try {
      const admin = await loginAdmin(t.app);
      const res = await t.app.request("/api/desktop/pet", { headers: { cookie: admin.cookie } });
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
      const res = await t.app.request("/api/desktop/pet", { headers: { cookie: admin.cookie } });
      expect(res.status).toBe(404);
    } finally {
      await t.cleanup();
    }
  });
});

describe("PUT /api/desktop/pet", () => {
  it("forwards the switch to the registered shell sender and answers 202", async () => {
    const t = await createDesktopApp();
    try {
      const cookie = await desktopLoginCookie(t.app);
      const sent: DesktopPetPatch[] = [];
      t.deps.desktop!.onPetCommand((patch) => sent.push(patch));

      const on = await t.app.request("/api/desktop/pet", put(cookie, '{"showPet":true}'));
      expect(on.status).toBe(202);
      // The pet window's own "hide me" writes the same field the Settings switch does.
      const off = await t.app.request("/api/desktop/pet", put(cookie, '{"showPet":false}'));
      expect(off.status).toBe(202);
      expect(sent).toEqual([{ showPet: true }, { showPet: false }]);
    } finally {
      await t.cleanup();
    }
  });

  it("refuses a field it cannot read, and a request that asks for nothing", async () => {
    const t = await createDesktopApp();
    try {
      const cookie = await desktopLoginCookie(t.app);
      const sent: DesktopPetPatch[] = [];
      t.deps.desktop!.onPetCommand((patch) => sent.push(patch));
      const cases: Array<[string, string]> = [
        ['{"showPet":"yes"}', "invalid_show_pet"],
        ['{"showPet":1}', "invalid_show_pet"],
        // Nothing to do is a caller bug, not a no-op worth waking the shell for. An
        // unparseable body lands here too: it asks for nothing this route understands.
        ["{}", "empty_pet_patch"],
        ["not json", "empty_pet_patch"],
      ];
      for (const [body, code] of cases) {
        const res = await t.app.request("/api/desktop/pet", put(cookie, body));
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
        "/api/desktop/pet",
        put(admin.cookie, '{"showPet":true}'),
      );
      expect(forbidden.status).toBe(403);

      const cookie = await desktopLoginCookie(t.app);
      const unreachable = await t.app.request("/api/desktop/pet", put(cookie, '{"showPet":true}'));
      expect(unreachable.status).toBe(503);
      expect(((await unreachable.json()) as ErrorBody).error.code).toBe("shell_unreachable");
    } finally {
      await t.cleanup();
    }
  });
});

describe("the pet half of the shell port", () => {
  it("parses only well-formed pet status frames", () => {
    expect(
      parsePetStatusMessage({ type: "desktop-pet-status", status: { showPet: true } }),
    ).toEqual({ showPet: true });
    // A push carrying more than this build knows about still reads as what it says.
    expect(
      parsePetStatusMessage({
        type: "desktop-pet-status",
        status: { showPet: false, size: 200 },
      }),
    ).toEqual({ showPet: false });
    for (const data of [
      null,
      "status",
      {},
      { type: "desktop-pet-status" },
      { type: "desktop-pet-status", status: null },
      { type: "desktop-pet-status", status: {} },
      { type: "desktop-pet-status", status: { showPet: "yes" } },
      // The other two relays ride the same port and must not be read as pet ones.
      { type: "desktop-updater-status", status: { appVersion: "1", state: "idle" } },
      { type: "desktop-tray-status", status: { showTrayIcon: true, locale: "zh" } },
    ]) {
      expect(parsePetStatusMessage(data)).toBeNull();
    }
  });

  it("stores pet pushes and posts pet commands beside the other relays, on one port", () => {
    const desktop = new DesktopService("t");
    const port = new FakePort();
    wireShellUpdatePort(desktop, port);

    port.emit({ type: "desktop-pet-status", status: { showPet: true } });
    expect(desktop.getPetStatus()).toEqual({ showPet: true });
    // A tray frame on the same port leaves the pet state alone, and vice versa.
    port.emit({ type: "desktop-tray-status", status: { showTrayIcon: false, locale: "zh" } });
    expect(desktop.getPetStatus()).toEqual({ showPet: true });
    expect(desktop.getTrayStatus()).toEqual({ showTrayIcon: false, locale: "zh" });

    expect(desktop.requestPetCommand({ showPet: false })).toBe(true);
    expect(port.sent).toEqual([{ type: "desktop-pet-command", showPet: false }]);
  });
});
