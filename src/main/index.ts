import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { registerIpc } from "./ipc/index.js";
import { closeDb } from "./db/index.js";
import { describePaths } from "./paths.js";
import { runSelfTest, wantsSelfTest } from "./selftest.js";

const isDev = !app.isPackaged;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0b0b0c",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      sandbox: false, // preload needs `require` for the contextBridge wiring
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show only once painted, so the window never flashes white.
  win.once("ready-to-show", () => win.show());

  // External links open in the real browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (isDev && devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}

app.whenReady().then(async () => {
  console.log(`[paths] ${describePaths()}`);

  // `--selftest` runs the packaged acceptance checks and exits without ever
  // creating a window, so a build can be verified from a shell.
  if (wantsSelfTest()) {
    const code = await runSelfTest();
    closeDb();
    app.exit(code);
    return;
  }

  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  closeDb();
  if (process.platform !== "darwin") app.quit();
});
