// Electron main process. Runs the existing Express+SSE server in-process and
// points a BrowserWindow at it, same pattern as Corelight Quick Deploy's
// electron/main.cjs — no server rewrite needed.
const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const path = require("node:path");
const url = require("node:url");
const http = require("node:http");

const PORT = Number(process.env.PORT || 8799);
const HOST = "127.0.0.1";
let mainWindow = null;

// If a previous instance is still running (e.g. left over from before an
// update), it's already holding the port this one needs - the OLD failure
// mode here was: the new instance silently hangs forever with a dock icon
// and no window, no error, nothing (startServer/waitForHealth below would
// reject, and that rejection was only ever logged, never shown). Instead,
// just hand off to the already-running instance and quit immediately.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

process.on("uncaughtException", (err) => {
  console.error("[cbb] uncaughtException (ignored):", err?.stack || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[cbb] unhandledRejection (ignored):", reason);
});

if (app.isPackaged) {
  process.env.CBB_RUNS_DIR = path.join(app.getPath("userData"), "runs");
}
process.env.SERVE_STATIC = "1";
process.env.PORT = String(PORT);

function serverEntry() {
  const base = app.isPackaged ? app.getAppPath() : path.join(__dirname, "..");
  return path.join(base, "server", "index.js");
}

function startServer() {
  return import(url.pathToFileURL(serverEntry()).href);
}

function waitForHealth(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: HOST, port: PORT, path: "/api/health" }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on("error", retry);
    };
    const retry = () => (Date.now() > deadline ? reject(new Error("server did not become healthy")) : setTimeout(tryOnce, 300));
    tryOnce();
  });
}

function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function attachContextMenu(win) {
  win.webContents.on("context-menu", (_e, params) => {
    const { editFlags, isEditable, selectionText } = params;
    if (!isEditable && !selectionText) return;
    const items = [];
    if (editFlags.canCut) items.push({ role: "cut" });
    if (editFlags.canCopy) items.push({ role: "copy" });
    if (editFlags.canPaste) items.push({ role: "paste" });
    if (items.length) items.push({ type: "separator" });
    items.push({ role: "selectAll" });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 900,
    title: "Corelight Bundle Builder",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
  attachContextMenu(win);
  await win.loadURL(`http://${HOST}:${PORT}/`);
}

app.whenReady().then(async () => {
  buildAppMenu();
  try {
    await startServer();
    await waitForHealth();
  } catch (err) {
    console.error("[cbb] startup failed, showing error dialog:", err.message);
    dialog.showErrorBox(
      "Corelight Bundle Builder failed to start",
      `The local server didn't come up: ${err.message}\n\nIf another copy of this app is already running, quit it first. Otherwise check that port ${PORT} isn't in use by something else.`
    );
    app.quit();
    return;
  }
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
