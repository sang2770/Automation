const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { spawn, fork } = require("child_process");
const fs = require("fs-extra");

class ElectronApp {
  constructor() {
    this.mainWindow = null;
    this.workerProcess = null;
    this.configPath = path.join(__dirname, "config.json");
    this.isRunning = false;
  }

  async initialize() {
    // Ensure config file exists
    if (!(await fs.pathExists(this.configPath))) {
      await this.saveDefaultConfig();
    }

    app.whenReady().then(() => {
      this.createMainWindow();
      this.setupIpcHandlers();
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        this.cleanup();
        app.quit();
      }
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    app.on("before-quit", () => {
      this.cleanup();
    });
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
      },
      icon: path.join(__dirname, "assets", "icon.png"),
      titleBarStyle: "default",
      show: false,
    });

    this.mainWindow.loadFile("renderer/index.html");

    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow.show();
    });

    // Open DevTools in development
    if (process.argv.includes("--dev")) {
      this.mainWindow.webContents.openDevTools();
    }

    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
      this.cleanup();
    });
  }

  setupIpcHandlers() {
    // Load configuration
    ipcMain.handle("load-config", async () => {
      try {
        const config = await fs.readJson(this.configPath);
        return { success: true, config };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Save configuration
    ipcMain.handle("save-config", async (event, config) => {
      try {
        await fs.writeJson(this.configPath, config, { spaces: 2 });
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Load GPM profiles
    ipcMain.handle("load-gpm-profiles", async () => {
      try {
        const axios = require("axios");
        const response = await axios.get(
          "http://127.0.0.1:19995/api/v3/profiles",
          {
            timeout: 5000,
          },
        );

        if (response.data.success) {
          return {
            success: true,
            profiles: response.data.data.map((profile) => ({
              id: profile.id,
              name: profile.name || `Profile ${profile.id}`,
              status: profile.status,
            })),
          };
        } else {
          return { success: false, error: "Failed to load profiles" };
        }
      } catch (error) {
        return {
          success: false,
          error:
            "GPM not running or not accessible. Please ensure GPMLogin is running on port 19995.",
        };
      }
    });

    // Start automation
    ipcMain.handle("start-automation", async (event, config) => {
      if (this.isRunning) {
        return { success: false, error: "Automation is already running" };
      }
      try {
        this.isRunning = true;
        this.workerProcess = fork(
          path.join(__dirname, "youtube-worker.js"),
          {
            stdio: ["pipe", "pipe", "pipe", "ipc"],
          },
        );

        this.workerProcess.on("message", (message) => {
          if (this.mainWindow) {
            this.mainWindow.webContents.send("worker-message", message);
          }
        });

        this.workerProcess.on("error", (error) => {
          this.isRunning = false;
          if (this.mainWindow) {
            this.mainWindow.webContents.send("worker-message", {
              type: "automation-error",
              data: { message: error.message },
            });
          }
        });

        this.workerProcess.on("exit", (code) => {
          this.isRunning = false;
          if (this.mainWindow) {
            this.mainWindow.webContents.send("worker-message", {
              type: "automation-stopped",
              data: { code },
            });
          }
        });
        // this.workerProcess.stdout.on("data", (data) => {
        //   console.log(`[Worker stdout]: ${data}`);
        // });
        // this.workerProcess.stderr.on("data", (data) => {
        //   console.error(`[Worker stderr]: ${data}`);
        // });
        // console.log("Worker process started with PID:", this.workerProcess.pid);

        // Send configuration to worker
        this.workerProcess.send({ type: "start", data: config });

        return { success: true };
      } catch (error) {
        this.isRunning = false;
        return { success: false, error: error.message };
      }
    });

    // Stop automation
    ipcMain.handle("stop-automation", async () => {
      if (!this.isRunning || !this.workerProcess) {
        return { success: false, error: "No automation is running" };
      }

      try {
        this.workerProcess.send({ type: "stop" });
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Get automation status
    ipcMain.handle("get-automation-status", () => {
      return { isRunning: this.isRunning };
    });
  }

  async saveDefaultConfig() {
    const defaultConfig = {
      links: [
        {
          id: 1,
          url: "https://www.youtube.com/watch?v=example1",
          views: 10,
          keywords: ["example", "video"],
          enabled: true,
        },
      ],
      profiles: [],
      maxThreads: 3,
      settings: {
        delayBetweenActions: 2000,
        randomMethod: true,
      },
    };

    await fs.writeJson(this.configPath, defaultConfig, { spaces: 2 });
  }

  cleanup() {
    if (this.workerProcess) {
      this.workerProcess.kill();
      this.workerProcess = null;
    }
    this.isRunning = false;
  }
}

// Initialize and start the application
const electronApp = new ElectronApp();
electronApp.initialize();
