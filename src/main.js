const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;

function resolveUnpacked(p) {
  if (p.includes("app.asar")) {
    return p.replace("app.asar", "app.asar.unpacked");
  }
  return p;
}

ffmpeg.setFfmpegPath(resolveUnpacked(ffmpegPath));
ffmpeg.setFfprobePath(resolveUnpacked(ffprobePath));

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// IPC Handlers

ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

function getConfigPath(filename) {
  if (app.isPackaged) {
    // Use userData directory for writable files in packaged app
    return path.join(app.getPath("userData"), filename);
  }
  return path.join(__dirname, "../config", filename);
}

// Settings IPC
const settingsPath = getConfigPath("settings.json");

ipcMain.handle("settings:load", async () => {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
  return null;
});

ipcMain.handle("settings:save", async (event, settings) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error("Error saving settings:", error);
    return false;
  }
});

// Helper: Get random files from folder
function getRandomFiles(dir, count) {
  try {
    if (!fs.existsSync(dir)) return [];
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".wav"));
    if (files.length === 0) return [];

    const selected = [];
    // Simple random sampling with replacement or without?
    // Usually "random X songs" implies picking X unique if possible, or repeats if count > total.
    // Let's do simple random pick.
    for (let i = 0; i < count; i++) {
      const randomIndex = Math.floor(Math.random() * files.length);
      selected.push(path.join(dir, files[randomIndex]));
    }
    return selected;
  } catch (err) {
    console.error(`Error reading dir ${dir}:`, err);
    return [];
  }
}

// Helper: Get Duration of a file (Promisified)
function getDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return resolve(0); // If error, assume 0 to not break loop
      resolve(metadata.format.duration || 0);
    });
  });
}

ipcMain.handle("process:start", async (event, config) => {
  const { input1, input2, input3, output, loop, duration } = config;
  const sender = event.sender;

  const log = (msg, type = "info") => {
    sender.send("log:update", { text: msg, type });
  };

  try {
    // validate dirs
    if (
      !fs.existsSync(input1.path) ||
      !fs.existsSync(input2.path) ||
      !fs.existsSync(input3.path)
    ) {
      throw new Error("One or more input directories do not exist.");
    }

    const finalList = [];
    let currentDuration = 0;

    // Step 1: Prepare Input 3 (Ending)
    log(`Selecting ${input3.count} files from Input 3 (Ending)...`);
    const files3 = getRandomFiles(input3.path, input3.count);
    if (files3.length === 0) throw new Error("No WAV files found in Input 3.");

    // Calculate duration of ending
    let duration3 = 0;
    for (const file of files3) {
      duration3 += await getDuration(file);
    }
    log(`Input 3 Duration: ${duration3.toFixed(2)}s`);

    if (loop) {
      const targetDuration = duration; // in seconds
      const neededDuration = targetDuration - duration3;
      log(`Target Loop Duration: ${targetDuration}s`);
      log(`Duration to fill with Input 1 & 2: ${neededDuration.toFixed(2)}s`);

      if (neededDuration <= 0) {
        log(
          "Warning: Input 3 is longer than target duration. Only Input 3 will be used.",
          "warn",
        );
        finalList.push(...files3);
      } else {
        let filledDuration = 0;
        let iteration = 1;

        while (filledDuration < neededDuration) {
          // Pick from Input 1
          const files1 = getRandomFiles(input1.path, input1.count);
          // Pick from Input 2
          const files2 = getRandomFiles(input2.path, input2.count);

          if (files1.length === 0 && files2.length === 0) {
            throw new Error("No WAV files found in Input 1 or Input 2.");
          }

          // Append sequence: Input 1 then Input 2
          // files1.forEach(f => finalList.push(f));
          // files2.forEach(f => finalList.push(f));
          // Check duration of this chunk
          for (const f of files1) {
            const d = await getDuration(f);
            filledDuration += d;
            finalList.push(f);
          }
          for (const f of files2) {
            const d = await getDuration(f);
            filledDuration += d;
            finalList.push(f);
          }

          log(
            `Iteration ${iteration}: Current Duration ${filledDuration.toFixed(2)}s / ${neededDuration.toFixed(2)}s`,
          );
          iteration++;

          // Safety break
          if (iteration > 1000) {
            log(
              "Safety limit reached (1000 iterations). Stopping loop.",
              "warn",
            );
            break;
          }
        }

        // Append Ending
        finalList.push(...files3);
      }
    } else {
      // No Loop Mode
      log("No Loop Mode: merging randomly selected files once.");

      const files1 = getRandomFiles(input1.path, input1.count);
      const files2 = getRandomFiles(input2.path, input2.count);

      if (files1.length === 0 && files2.length === 0 && files3.length === 0) {
        throw new Error("No WAV files found in any input.");
      }

      finalList.push(...files1);
      finalList.push(...files2);
      finalList.push(...files3);
    }

    log(`Total files to merge: ${finalList.length}`);

    // Merge Logic
    // Create a temporary file list for ffmpeg concat demuxer
    const listPath = path.join(
      app.getPath("temp"),
      `concat_list_${Date.now()}.txt`,
    );
    // Format for concat demuxer: file 'path'
    const listContent = finalList
      .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
      .join("\n");
    fs.writeFileSync(listPath, listContent);

    const outputFileName = `output_${Date.now()}.wav`;
    const outputPath = path.join(output, outputFileName);

    log(
      `Processing merge... ${finalList.length} files. Output target: ${outputPath}`,
    );

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions("-c copy") // Using copy for speed.
        .on("start", (cmd) => {
          log(`FFmpeg command started: ${cmd}`);
        })
        .on("progress", (progress) => {
          if (progress.percent) {
            // log(`Progress: ${Math.floor(progress.percent)}%`);
            // Too spammy for IPC?
          }
        })
        .on("error", (err) => {
          log(`FFmpeg Error: ${err.message}`, "error");
          reject(err);
        })
        .on("end", () => {
          resolve();
        })
        .save(outputPath);
    });

    // Cleanup
    fs.unlinkSync(listPath);

    sender.send("process:complete", `Success! Saved to ${outputPath}`);
  } catch (err) {
    log(`Error: ${err.message}`, "error");
    sender.send("process:error", err.message);
  }
});
