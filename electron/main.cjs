// Electron main process. Runs the existing Express+SSE server in-process and
// points a BrowserWindow at it, same pattern as Corelight Quick Deploy's
// electron/main.cjs — no server rewrite needed.
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("node:path");
const url = require("node:url");
const http = require("node:http");

const PORT = Number(process.env.PORT || 8799);
const HOST = "127.0.0.1";

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
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
  attachContextMenu(win);
  await win.loadURL(`http://${HOST}:${PORT}/`);
}

app.whenReady().then(async () => {
  buildAppMenu();
  await startServer();
  await waitForHealth();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
