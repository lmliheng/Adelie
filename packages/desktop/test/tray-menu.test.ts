/**
 * 托盘菜单模板：文案、勾选状态、动作，以及各平台该怎么接。
 *
 * 菜单是纯数据，所以「偏好关掉时勾选框不该打勾」这种最容易写错、又最难在无头环境里肉眼
 * 看到的东西，可以在这里断言。
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_TRAY_PREFS } from "../src/tray-prefs.js";
import { trayMenuTemplate, trayPlatformStyle, trayTooltip } from "../src/tray-menu.js";

describe("trayMenuTemplate", () => {
  const base = { productName: "Adelie", origin: "http://127.0.0.1:7370", prefs: DEFAULT_TRAY_PREFS };

  it("含打开窗口、浏览器、退出，且分隔符不承载动作", () => {
    const items = trayMenuTemplate(base);
    const ids = items.map((item) => item.id);
    expect(ids).toContain("show");
    expect(ids).toContain("open-browser");
    expect(ids).toContain("quit");
    expect(items.filter((item) => item.type === "separator").every((item) => item.action === undefined)).toBe(true);
  });

  it("关窗留守的勾选跟着偏好走，而不是写死", () => {
    const checked = trayMenuTemplate(base).find((item) => item.id === "hide-on-close");
    expect(checked?.checked).toBe(true);

    const unchecked = trayMenuTemplate({
      ...base,
      prefs: { showIcon: true, hideOnClose: false },
    }).find((item) => item.id === "hide-on-close");
    expect(unchecked?.checked).toBe(false);
  });

  it("每个非分隔项都带一个动作（菜单不会点了没反应）", () => {
    const items = trayMenuTemplate(base);
    expect(items.filter((item) => item.type !== "separator").every((item) => item.action !== undefined)).toBe(true);
  });

  it("中英两份，缺省中文", () => {
    const zh = trayMenuTemplate(base).find((item) => item.id === "quit")?.label;
    const en = trayMenuTemplate({ ...base, locale: "en" }).find((item) => item.id === "quit")?.label;
    expect(zh).toBe("退出 Adelie");
    expect(en).toBe("Quit Adelie");
  });
});

describe("trayPlatformStyle", () => {
  it("Linux 的托盘只认常驻菜单，点击不唤起窗口", () => {
    expect(trayPlatformStyle("linux")).toEqual({ attachMenuAlways: true, clickShowsWindow: false });
  });

  it("Windows / macOS 左键唤起窗口，菜单只在右键弹", () => {
    expect(trayPlatformStyle("win32")).toEqual({ attachMenuAlways: false, clickShowsWindow: true });
    expect(trayPlatformStyle("darwin")).toEqual({ attachMenuAlways: false, clickShowsWindow: true });
  });
});

describe("trayTooltip", () => {
  it("品牌 + origin：鼠标悬停就知道它开在哪个端口", () => {
    expect(trayTooltip("Adelie", "http://127.0.0.1:7370")).toBe("Adelie · http://127.0.0.1:7370");
  });
});
