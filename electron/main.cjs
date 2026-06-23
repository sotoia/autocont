/**
 * AUTOCONT — Electron wrapper opcional.
 *
 * Arranca el server de Next.js (standalone) como subproceso del proceso
 * principal de Electron y abre una ventana nativa apuntando a localhost.
 * Cuando cierras la app, mata el server. Es lo mínimo para tener un .dmg
 * que el usuario abre con doble click — sin tocar terminal.
 */
const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const net = require("node:net");

// Single-instance: si el usuario abre la app dos veces, foco a la ventana
// existente en lugar de arrancar otro server.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let mainWindow = null;
let nextServer = null;
let serverPort = 0;

/** Busca un puerto TCP libre arrancando desde 3000. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

/** Espera (poll) hasta que un puerto responda HTTP 200/3xx. */
function waitForPort(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error("Timeout esperando al server Next.js"));
        else setTimeout(tick, 250);
      });
      sock.once("timeout", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error("Timeout esperando al server Next.js"));
        else setTimeout(tick, 250);
      });
      sock.connect(port, "127.0.0.1");
    };
    tick();
  });
}

/** Resuelve la ruta al server.js de Next.js standalone, ya estemos en
 *  modo dev (proyecto root) o empaquetado (resources/app/). */
function resolveServerScript() {
  // En empaquetado: app.asar.unpacked/.next/standalone/server.js
  // En dev: ../.next/standalone/server.js
  const candidates = [
    path.join(process.resourcesPath || "", "app.asar.unpacked", ".next", "standalone", "server.js"),
    path.join(process.resourcesPath || "", "app", ".next", "standalone", "server.js"),
    path.join(__dirname, "..", ".next", "standalone", "server.js"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

async function startNextServer() {
  const script = resolveServerScript();
  if (!script) {
    throw new Error("No encuentro .next/standalone/server.js — ejecuta 'npm run build' antes");
  }
  serverPort = await findFreePort();
  const env = { ...process.env, PORT: String(serverPort), HOSTNAME: "127.0.0.1", NODE_ENV: "production" };

  // userData: SQLite + uploads viven en la carpeta de usuario del SO, no
  // dentro del .app empaquetado (que es read-only en macOS firmado).
  const userData = app.getPath("userData");
  fs.mkdirSync(path.join(userData, "data"), { recursive: true });
  fs.mkdirSync(path.join(userData, "public", "uploads"), { recursive: true });
  env.AUTOCONT_DATA_DIR = path.join(userData, "data");
  env.AUTOCONT_UPLOADS_DIR = path.join(userData, "public", "uploads");

  nextServer = spawn(process.execPath, [script], {
    env,
    cwd: path.dirname(script),
    stdio: ["ignore", "pipe", "pipe"],
  });
  nextServer.stdout.on("data", (d) => process.stdout.write(`[next] ${d}`));
  nextServer.stderr.on("data", (d) => process.stderr.write(`[next-err] ${d}`));
  nextServer.on("exit", (code) => {
    console.log(`[next] exited with code ${code}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox("AUTOCONT", "El server interno se cayó. La app va a cerrarse.");
      app.quit();
    }
  });

  await waitForPort(serverPort);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0a0a0a",
    title: "AUTOCONT",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/dashboard`);

  // Links externos → abrir en el navegador del sistema, no dentro de la app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  try {
    await startNextServer();
    createWindow();
  } catch (err) {
    dialog.showErrorBox("AUTOCONT — error arrancando", err.message || String(err));
    app.quit();
  }
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (nextServer && !nextServer.killed) {
    try { nextServer.kill("SIGTERM"); } catch {}
  }
});

// Menú mínimo (macOS sigue mostrando algo, en Win/Linux lo escondemos)
if (process.platform === "darwin") {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]));
} else {
  Menu.setApplicationMenu(null);
}
