/**
 * The tray menu window's bridge: the two things that window may say — how big it turned out, and
 * which entry was clicked — and nothing else.
 *
 * Plain CommonJS on purpose: Electron loads a preload into a sandboxed context as is, not as a
 * module, so it cannot be one of the tsup bundles beside it. scripts/build-assets.mjs copies it
 * into dist/, where src/tray-menu-window.ts resolves it.
 *
 * The channel names are the ones in TRAY_MENU_CHANNELS there; a unit test reads this file back
 * and pins the two together.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("trayMenu", {
  reportSize: (size) => ipcRenderer.send("tray-menu:size", size),
  pick: (action) => ipcRenderer.send("tray-menu:pick", action),
});
