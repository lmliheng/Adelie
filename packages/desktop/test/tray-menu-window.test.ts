import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trayMenuTemplate } from "../src/tray-menu.js";
import {
  TRAY_MENU_CHANNELS,
  TRAY_MENU_MAX_SIZE,
  TRAY_MENU_MIN_WIDTH,
  TRAY_MENU_PRELOAD_RELPATH,
  TRAY_MENU_WINDOW_OPTIONS,
  placeTrayMenu,
  resolveTrayMenuPreload,
  trayMenuDocument,
  trayMenuDocumentUrl,
  trayMenuSize,
} from "../src/tray-menu-window.js";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

/** The menu as the shell draws it, for the document tests. */
function items(closeToTray = true) {
  return trayMenuTemplate({ appName: "Adelie", closeToTray, locale: "zh" });
}

describe("trayMenuSize", () => {
  it("takes a report the page could have measured", () => {
    expect(trayMenuSize({ width: 208.4, height: 130.2 })).toEqual({ width: 209, height: 131 });
  });

  it("keeps a menu from being reported narrower than it can be read at", () => {
    expect(trayMenuSize({ width: 12, height: 40 })).toEqual({
      width: TRAY_MENU_MIN_WIDTH,
      height: 40,
    });
  });

  it("caps what a page gone wrong may ask for", () => {
    expect(trayMenuSize({ width: 99999, height: 99999 })).toEqual({
      width: TRAY_MENU_MAX_SIZE.width,
      height: TRAY_MENU_MAX_SIZE.height,
    });
  });

  it("refuses anything that is not a size", () => {
    for (const value of [
      undefined,
      null,
      7,
      "208x130",
      {},
      { width: 208 },
      { width: "208", height: 130 },
      { width: Number.NaN, height: 130 },
      { width: Number.POSITIVE_INFINITY, height: 130 },
      { width: 0, height: 130 },
      { width: 208, height: -1 },
    ]) {
      expect(trayMenuSize(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe("placeTrayMenu", () => {
  // A 1920×1080 work area with the taskbar at the bottom: the icon sits at its lower right.
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  const icon = { x: 1800, y: 1044, width: 24, height: 24 };
  const size = { width: 208, height: 130 };

  it("opens above an icon that sits in the lower half, right edges aligned", () => {
    expect(placeTrayMenu(icon, size, workArea)).toEqual({
      x: 1616,
      y: 908,
      width: 208,
      height: 130,
    });
  });

  it("opens below an icon that sits in the upper half", () => {
    const top = { x: 1800, y: 4, width: 24, height: 24 };
    const area = { x: 0, y: 0, width: 1920, height: 300 };
    expect(placeTrayMenu(top, size, area)).toEqual({ x: 1616, y: 34, width: 208, height: 130 });
  });

  it("keeps the menu inside the work area when the icon is against its edge", () => {
    const corner = { x: 1912, y: 1032, width: 8, height: 8 };
    expect(placeTrayMenu(corner, size, workArea)).toEqual({
      x: 1712,
      y: 896,
      width: 208,
      height: 130,
    });
  });

  it("pins a menu taller than the work area to its top", () => {
    const placed = placeTrayMenu(icon, { width: 208, height: 2000 }, workArea);
    expect(placed.y).toBe(workArea.y);
    expect(placed.height).toBe(2000);
  });
});

describe("trayMenuDocument", () => {
  it("draws every entry of the menu it is given", () => {
    const menu = items();
    const html = trayMenuDocument({ items: menu, dark: false });
    for (const item of menu) {
      if (item.label !== undefined) expect(html, item.label).toContain(item.label);
    }
    // One element per separator, and no more.
    const separators = menu.filter((item) => item.type === "separator").length;
    expect(html.match(/class="sep"/g)).toHaveLength(separators);
  });

  it("marks the checkbox entry with the preference it was given", () => {
    expect(trayMenuDocument({ items: items(true), dark: false })).toContain('aria-checked="true"');
    expect(trayMenuDocument({ items: items(false), dark: false })).toContain(
      'aria-checked="false"',
    );
  });

  it("follows the system's appearance", () => {
    expect(trayMenuDocument({ items: items(), dark: true })).toContain('<body class="dark">');
    expect(trayMenuDocument({ items: items(), dark: false })).toContain('<body class="light">');
  });

  it("carries the action of every row, so a click has something to report", () => {
    const html = trayMenuDocument({ items: items(), dark: false });
    for (const action of ["open", "toggle-close-to-tray", "restart", "quit"]) {
      expect(html, action).toContain(`data-action="${action}"`);
    }
  });

  it("escapes a label rather than letting it be markup", () => {
    const html = trayMenuDocument({
      items: [{ action: "open", label: '<b>&"x"</b>' }],
      dark: false,
    });
    expect(html).toContain("&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });

  it("loads nothing, and says so", () => {
    expect(trayMenuDocument({ items: items(), dark: false })).toContain(
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    );
  });
});

describe("trayMenuDocumentUrl", () => {
  it("is a data URL that decodes back to the document", () => {
    const document = trayMenuDocument({ items: items(), dark: true });
    const url = trayMenuDocumentUrl(document);
    expect(url.startsWith("data:text/html;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.slice("data:text/html;charset=utf-8,".length))).toBe(document);
  });
});

describe("the menu window", () => {
  it("keeps the same hardening as every other window this app opens", () => {
    expect(TRAY_MENU_WINDOW_OPTIONS.show).toBe(false);
    expect(TRAY_MENU_WINDOW_OPTIONS.webPreferences).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
    // Nothing to frame, no room around the menu: a transparent corner swallows a click on it.
    expect(TRAY_MENU_WINDOW_OPTIONS.frame).toBe(false);
    expect(TRAY_MENU_WINDOW_OPTIONS.transparent).toBe(true);
    expect(TRAY_MENU_WINDOW_OPTIONS.alwaysOnTop).toBe(true);
  });

  it("sends on the channels the shell listens to", () => {
    const preload = fs.readFileSync(path.join(srcDir, "tray-menu-preload.cjs"), "utf8");
    expect(preload).toContain("exposeInMainWorld");
    for (const channel of Object.values(TRAY_MENU_CHANNELS)) {
      expect(preload, channel).toContain(`"${channel}"`);
    }
    // The page talks over that bridge and no other.
    const html = trayMenuDocument({ items: items(), dark: false });
    expect(html).toContain("window.trayMenu");
    expect(html).toContain("bridge.reportSize(");
    expect(html).toContain("bridge.pick(");
  });
});

describe("resolveTrayMenuPreload", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tray-menu-preload-"));
  afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  it("is null where the asset build has not run", () => {
    expect(resolveTrayMenuPreload(tempDir)).toBeNull();
  });

  it("finds the bridge beside the bundles once it has", () => {
    const bridge = path.join(tempDir, ...TRAY_MENU_PRELOAD_RELPATH);
    fs.mkdirSync(path.dirname(bridge), { recursive: true });
    fs.writeFileSync(bridge, "");
    expect(resolveTrayMenuPreload(tempDir)).toBe(bridge);
  });
});
