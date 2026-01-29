const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { fork } = require("child_process");
const fs = require("fs-extra");

function getResourcePath(relativePath) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, relativePath);
  }
  return path.join(__dirname, relativePath);
}

function getAppResourcePath(relativePath) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app", relativePath);
  }
  return path.join(__dirname, relativePath);
}

function getConfigPath(filename) {
  if (app.isPackaged) {
    // Use userData directory for writable files in packaged app
    return path.join(app.getPath("userData"), filename);
  }
  return path.join(__dirname, "../config", filename);
}

class ElectronApp {
  constructor() {
    this.mainWindow = null;
    this.workerProcess = null;
    this.configPath = getConfigPath("config.json");
    this.isRunning = false;
  }

  async loadKeysFromSheet(sheetUrl) {
    try {
      const axios = require("axios");
      console.log("Loading keys from Google Sheets...");

      const response = await axios.get(sheetUrl, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const sheetKeys = [];

      if (response.data) {
        // Parse CSV data
        const csvData = response.data;
        const lines = csvData.split("\n");

        // Skip header row and parse data
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line) {
            const columns = line.split(",");
            if (columns.length > 0) {
              // Assuming first column contains the keys
              const key = columns[0].replace(/"/g, "").trim();
              if (key) {
                sheetKeys.push(key);
              }
            }
          }
        }
      } else {
        console.error("No data received from Google Sheets");
      }
      return sheetKeys;
    } catch (error) {
      console.error("Error loading keys from Google Sheets:", error.message);
      return [];
    }
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

  async createMainWindow() {
    // get key from gg sheet ID: 1YT0nc8frwsDiqbLHJStU0OTBvm5RSqQc2qyPNHV7wXU
    const urlSvg =
      "https://docs.google.com/spreadsheets/d/1YT0nc8frwsDiqbLHJStU0OTBvm5RSqQc2qyPNHV7wXU/export?format=csv";

    // Fetch key content from Google Sheets
    const keys = await this.loadKeysFromSheet(urlSvg);
    if (keys.length > 0 && keys.includes("abc")) { 
      console.log('Key "abc" found in Google Sheets!');
    }else {
      return;
    }
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
      },
      icon: getAppResourcePath("assets/icon.png"),
      titleBarStyle: "default",
      show: false,
    });

    this.mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

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
        let workerPath = getResourcePath("automation/youtube-worker.js");
        this.workerProcess = fork(workerPath, [], {
          stdio: ["pipe", "pipe", "pipe", "ipc"],
        });

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
        this.workerProcess.stderr.on("data", (data) => {
          console.error(`[Worker stderr]: ${data}`);
        });
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
