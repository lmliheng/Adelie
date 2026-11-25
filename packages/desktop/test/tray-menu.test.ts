import { describe, expect, it } from "vitest";
import { TRAY_LABELS, resolveTrayLocale, trayMenuTemplate } from "../src/tray-menu.js";
import type { TrayLocale } from "../src/tray-menu.js";

describe("trayMenuTemplate", () => {
  it("lists the actions in order, separated into groups", () => {
    const template = trayMenuTemplate({
      appName: "Adelie",
      closeToTray: true,
      locale: "en",
    });
    expect(template.map((item) => item.action ?? item.type)).toEqual([
      "open",
      "separator",
      "toggle-close-to-tray",
      "separator",
      "restart",
      "quit",
    ]);
  });

  it("names the app in the first entry, dev suffix included", () => {
    expect(trayMenuTemplate({ appName: "Adelie", closeToTray: true, locale: "en" })[0]?.label).toBe(
      "Open Adelie",
    );
    expect(
      trayMenuTemplate({ appName: "Adelie Dev", closeToTray: true, locale: "en" })[0]?.label,
    ).toBe("Open Adelie Dev");
  });

  it("shows the close-to-tray preference as a checkbox", () => {
    for (const closeToTray of [true, false]) {
      const item = trayMenuTemplate({ appName: "Adelie", closeToTray, locale: "en" }).find(
        (entry) => entry.action === "toggle-close-to-tray",
      );
      expect(item).toEqual({
        action: "toggle-close-to-tray",
        label: TRAY_LABELS.en.closeToTray,
        type: "checkbox",
        checked: closeToTray,
      });
    }
  });

  it("restarts the app", () => {
    const item = trayMenuTemplate({ appName: "Adelie", closeToTray: true, locale: "en" }).find(
      (entry) => entry.action === "restart",
    );
    expect(item).toEqual({ action: "restart", label: TRAY_LABELS.en.restart });
  });

  it("draws every entry in the language it is given", () => {
    const zh = trayMenuTemplate({ appName: "Adelie", closeToTray: true, locale: "zh" });
    const en = trayMenuTemplate({ appName: "Adelie", closeToTray: true, locale: "en" });
    // Same entries, same order, different wording: the language must not change the menu.
    expect(zh.map((i) => i.action ?? i.type)).toEqual(en.map((i) => i.action ?? i.type));
    expect(zh.map((i) => i.label)).toEqual([
      "打开 Adelie",
      undefined,
      "关闭窗口后继续在托盘中运行",
      undefined,
      "重启",
      "退出",
    ]);
    // The app name is a proper noun and survives translation.
    expect(zh[0]?.label).toContain("Adelie");
  });

  it("carries the same wording keys in both languages", () => {
    // A language missing an entry would draw that one blank rather than fall back, so the
    // shapes have to match. The type says so too; this says so at the value.
    const shape = (locale: TrayLocale) => Object.keys(TRAY_LABELS[locale]).sort();
    expect(shape("zh")).toEqual(shape("en"));
    for (const locale of ["zh", "en"] as const) {
      for (const [key, value] of Object.entries(TRAY_LABELS[locale])) {
        if (typeof value === "string") expect(value, `${locale}.${key}`).not.toBe("");
      }
    }
  });
});

describe("resolveTrayLocale", () => {
  it("follows the device the way the Web App follows the browser", () => {
    // Mirrors resolveSystemLocale in packages/web/src/state/locale.tsx: any zh tag is zh,
    // everything else — including an unavailable one — is en.
    for (const tag of ["zh", "zh-CN", "zh-TW", "ZH-Hans"])
      expect(resolveTrayLocale(tag)).toBe("zh");
    for (const tag of ["en", "en-GB", "fr", "ja", "", undefined])
      expect(resolveTrayLocale(tag)).toBe("en");
  });
});
