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
  const {
    input1,
    input2,
    input3,
    output,
    loop,
    duration,
    runCount = 1,
  } = config;
  const sender = event.sender;

  const log = (msg, type = "info") => {
    sender.send("log:update", { text: msg, type });
  };

  // Function to process a single run
  const processSingleRun = async (runIndex) => {
    log(`\n=== Bắt đầu lần chạy ${runIndex}/${runCount} ===`, "info");

    const finalList = [];

    // Step 1: Prepare Input 3 (Ending)
    log(
      `[Run ${runIndex}] Selecting ${input3.count} files from Input 3 (Ending)...`,
    );
    const files3 = getRandomFiles(input3.path, input3.count);
    if (files3.length === 0) throw new Error("No WAV files found in Input 3.");

    // Calculate duration of ending
    let duration3 = 0;
    for (const file of files3) {
      duration3 += await getDuration(file);
    }
    log(`[Run ${runIndex}] Input 3 Duration: ${duration3.toFixed(2)}s`);

    if (loop) {
      const targetDuration = duration; // in seconds
      const neededDuration = targetDuration - duration3;
      log(`[Run ${runIndex}] Target Loop Duration: ${targetDuration}s`);
      log(
        `[Run ${runIndex}] Duration to fill with Input 1 & 2: ${neededDuration.toFixed(2)}s`,
      );

      if (neededDuration <= 0) {
        log(
          `[Run ${runIndex}] Warning: Input 3 is longer than target duration. Only Input 3 will be used.`,
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
            `[Run ${runIndex}] Iteration ${iteration}: Current Duration ${filledDuration.toFixed(2)}s / ${neededDuration.toFixed(2)}s`,
          );
          iteration++;

          // Safety break
          if (iteration > 1000) {
            log(
              `[Run ${runIndex}] Safety limit reached (1000 iterations). Stopping loop.`,
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
      log(
        `[Run ${runIndex}] No Loop Mode: merging randomly selected files once.`,
      );

      const files1 = getRandomFiles(input1.path, input1.count);
      const files2 = getRandomFiles(input2.path, input2.count);

      if (files1.length === 0 && files2.length === 0 && files3.length === 0) {
        throw new Error("No WAV files found in any input.");
      }

      finalList.push(...files1);
      finalList.push(...files2);
      finalList.push(...files3);
    }

    log(`[Run ${runIndex}] Total files to merge: ${finalList.length}`);

    // Merge Logic
    // Create a temporary file list for ffmpeg concat demuxer
    const listPath = path.join(
      app.getPath("temp"),
      `concat_list_${runIndex}_${Date.now()}.txt`,
    );
    // Format for concat demuxer: file 'path'
    const listContent = finalList
      .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
      .join("\n");
    fs.writeFileSync(listPath, listContent);

    const timestamp = Date.now();
    const folderName = `output_${runIndex}_${timestamp}`;
    const folderPath = path.join(output, folderName);

    // Create the subdirectory if it doesn't exist
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const outputFileName = `${folderName}.wav`; // Files inside can match folder name for clarity
    const outputPath = path.join(folderPath, outputFileName);

    // Create text log file with the list of merged files
    const logFileName = `${folderName}.txt`;
    const logFilePath = path.join(folderPath, logFileName);

    // Create log content with file order
    let logFileContent = `=== Lần chạy ${runIndex}/${runCount} ===\n`;
    logFileContent += `Thời gian: ${new Date().toLocaleString("vi-VN")}\n`;
    logFileContent += `Tổng số file: ${finalList.length}\n\n`;
    logFileContent += `Danh sách file theo thứ tự:\n`;
    logFileContent += `${"=".repeat(80)}\n\n`;

    finalList.forEach((file, index) => {
      const fileName = path.basename(file);
      const fileDir = path.basename(path.dirname(file));
      logFileContent += `${index + 1}. ${fileName}\n`;
      logFileContent += `   Thư mục: ${fileDir}\n`;
      logFileContent += `   Đường dẫn: ${file}\n\n`;
    });

    fs.writeFileSync(logFilePath, logFileContent, "utf-8");
    log(`[Run ${runIndex}] Đã tạo file log: ${logFileName}`);

    log(
      `[Run ${runIndex}] Đang xử lý ghép... ${finalList.length} files. Output: ${outputPath}`,
    );

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions(["-c", "copy", "-rf64", "always"])
        .format("wav")
        .on("start", (cmd) => {
          log(`[Run ${runIndex}] Bắt đầu xử lý...`);
        })
        .on("progress", (progress) => {
          if (progress.percent) {
            // log(`Progress: ${Math.floor(progress.percent)}%`);
            // Too spammy for IPC?
          }
        })
        .on("error", (err) => {
          log(`[Run ${runIndex}] FFmpeg Error: ${err.message}`, "error");
          reject(err);
        })
        .on("end", () => {
          resolve();
        })
        .save(outputPath);
    });

    // Cleanup
    fs.unlinkSync(listPath);

    log(`✓ Hoàn thành lần chạy ${runIndex}: ${outputFileName}`, "success");
    return { runIndex, outputFileName };
  };

  try {
    // validate dirs
    if (
      !fs.existsSync(input1.path) ||
      !fs.existsSync(input2.path) ||
      !fs.existsSync(input3.path)
    ) {
      throw new Error("Một hoặc nhiều thư mục đầu vào không tồn tại.");
    }

    log(`Bắt đầu xử lý ${runCount} lần SONG SONG (đa luồng)...`, "info");

    // Create array of promises for parallel processing
    const runPromises = [];
    for (let runIndex = 1; runIndex <= runCount; runIndex++) {
      runPromises.push(processSingleRun(runIndex));
    }

    // Execute all runs in parallel
    const results = await Promise.all(runPromises);

    sender.send(
      "process:complete",
      `Thành công! Đã tạo ${runCount} output trong ${output}`,
    );
  } catch (err) {
    log(`Error: ${err.message}`, "error");
    sender.send("process:error", err.message);
  }
});
