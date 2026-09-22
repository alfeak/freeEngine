const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const http = require("http");

// 启用 WebGPU 及高性能图形参数
app.commandLine.appendSwitch("enable-unsafe-webgpu");
app.commandLine.appendSwitch("enable-features", "Vulkan,UseSkiaRenderer");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

let mainWindow = null;

async function checkDevServer(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 304);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: "freeEngine - 2.5D WebGPU & LLM-Native Runtime",
    backgroundColor: "#07090e",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webgl: true,
    },
  });

  const devUrl = "http://localhost:3000";
  const isDevRunning = await checkDevServer(devUrl);

  if (isDevRunning) {
    console.log("[Electron] Connecting to Vite Dev Server:", devUrl);
    await mainWindow.loadURL(devUrl);
  } else {
    const prodFile = path.resolve(__dirname, "../../dist/index.html");
    console.log("[Electron] Loading Production Built File:", prodFile);
    await mainWindow.loadFile(prodFile);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
