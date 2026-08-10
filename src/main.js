const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;
const { machineId } = require("node-machine-id");
const axios = require("axios");

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

const SUPPORTED_AUDIO_EXTENSIONS = new Set([".mp3", ".wav"]);

// Helper: Get a random sample of audio files from a folder.
function getRandomFiles(dir, count) {
  try {
    if (!fs.existsSync(dir)) return [];

    const files = fs
      .readdirSync(dir)
      .filter((f) => SUPPORTED_AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .filter((f) => {
        try {
          return fs.statSync(path.join(dir, f)).isFile();
        } catch {
          return false;
        }
      });

    if (files.length === 0) return [];

    const requestedCount = Math.max(0, Math.floor(Number(count) || 0));
    const shuffled = [...files];

    // Fisher-Yates gives a random, non-repeating sample.
    for (let i = shuffled.length - 1; i > 0; i--) {
      const randomIndex = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
    }

    return shuffled
      .slice(0, Math.min(requestedCount, shuffled.length))
      .map((f) => path.join(dir, f));
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

// Helper: Clean up all temp audio files
function cleanupTempFiles() {
  try {
    const tempDir = app.getPath("temp");
    const files = fs.readdirSync(tempDir);

    const tempAudioFiles = files.filter(
      (f) =>
        f.startsWith("wav_") ||
        f.startsWith("trimmed_") ||
        f.startsWith("merged_") ||
        f.startsWith("temp_output_") ||
        (f.includes("concat_") && f.endsWith(".txt")),
    );

    let cleanedCount = 0;
    tempAudioFiles.forEach((file) => {
      try {
        const filePath = path.join(tempDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      } catch (err) {
        // Ignore errors for files that might be in use
      }
    });

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} remaining temp files`);
    }
  } catch (err) {
    console.error("Error during temp cleanup:", err);
  }
}

ipcMain.handle("process:start", async (event, config) => {
  const {
    input1,
    input2,
    output,
    runCount = 1,
    repeatEnabled = false,
    repeatCount = 1,
  } = config;

  const sender = event.sender;

  const log = (msg, type = "info") => {
    sender.send("log:update", { text: msg, type });
  };

  const processSingleRun = async (runIndex) => {
    log(`\n=== Bắt đầu lần chạy ${runIndex}/${runCount} ===`);
    await processSingleOutput(runIndex);
  };

  const processSingleOutput = async (runIndex) => {
    const finalList = [];
    const originalFilesList = []; // Track all original audio file paths

    const files1 = getRandomFiles(input1.path, input1.count);
    const files2 = getRandomFiles(input2.path, input2.count);

    if (files1.length === 0 && files2.length === 0)
      throw new Error("Không tìm thấy file MP3 hoặc WAV trong các thư mục Input.");

    log(
      `[Run ${runIndex}] Chọn ngẫu nhiên ${files1.length} bài từ Input 1 và ${files2.length} bài từ Input 2.`,
    );

    const cycles = repeatEnabled ? Math.max(1, Number(repeatCount) || 1) : 1;

    // Ghép Input 1 + Input 2; chỉ lặp khi người dùng bật checkbox.
    for (let rep = 0; rep < cycles; rep++) {
      const allFilesForRepeat = [
        files1,
        files2,
      ];

      for (const files of allFilesForRepeat) {
        for (const file of files) {
          finalList.push(file);
          originalFilesList.push(file);
        }
      }
    }

    let verify = 0;
    for (const f of finalList) {
      verify += await getDuration(f);
    }

    log(`[Run ${runIndex}] Duration cuối cùng: ${verify.toFixed(3)}s`);


    return await finalizeOutput(runIndex, finalList, originalFilesList, verify);
  };

  const finalizeOutput = async (
    runIndex,
    finalList,
    originalFilesList,
    verify,
  ) => {
    const outputName = `temp_output_${runIndex}_${Date.now()}.mp3`;
    const outputPath = path.join(app.getPath("temp"), outputName);

    try {
      // ==============================
      // 5️⃣ CONCAT AUDIO FILES
      // Normalize each input stream first so MP3 and WAV can be mixed.
      // ==============================

      const command = ffmpeg();
      const normalizedLabels = finalList.map((_, index) => `audio${index}`);
      const filters = finalList.map((_, index) => ({
        filter: "aformat",
        options: "sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo",
        inputs: `${index}:a`,
        outputs: normalizedLabels[index],
      }));

      finalList.forEach((file) => command.input(file));
      filters.push({
        filter: "concat",
        options: `n=${finalList.length}:v=0:a=1`,
        inputs: normalizedLabels,
        outputs: "joined",
      });

      await new Promise((resolve, reject) => {
        command
          .complexFilter(filters, "joined")
          .outputOptions([
            "-acodec", "libmp3lame",
            "-ar", "44100",
            "-ac", "2",
            "-b:a", "192k"
          ])
          .on("progress", (p) => {
            // log(`[Run ${runIndex}] Joining MP3...`);
          })
          .on("error", (err) => {
            log(`Error in ffmpeg joining: ${err.message}`, "error");
            reject(err);
          })
          .on("end", resolve)
          .save(outputPath);
      });

      // ==============================
      // 📝 EXPORT FINAL FILE & LOG
      // ==============================

      const finalOutputName = `output_${runIndex}_${Date.now()}.mp3`;
      const finalOutputPath = path.join(output, finalOutputName);

      if (!fs.existsSync(outputPath)) {
        throw new Error(`Không tìm thấy file kết quả tạm tại: ${outputPath}`);
      }

      // Đảm bảo thư mục đầu ra tồn tại
      if (!fs.existsSync(output)) {
        fs.mkdirSync(output, { recursive: true });
      }

      // Move temp file to final location
      try {
        fs.copyFileSync(outputPath, finalOutputPath);
      } catch (copyErr) {
        throw new Error(`Lỗi khi copy file từ ${outputPath} sang ${finalOutputPath}: ${copyErr.message}`);
      }

      // Dọn dẹp file tạm ngay sau khi copy thành công
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

      const logFileName = finalOutputName.replace(".mp3", "_log.txt");
      const logFilePath = path.join(output, logFileName);

      let logFileContent = "";
      logFileContent += `Run: ${runIndex}/${runCount}\n`;
      logFileContent += `Output file: ${finalOutputName}\n`;
      logFileContent += `Tổng số file ghép: ${finalList.length}\n`;
      logFileContent += `Duration actual: ${verify.toFixed(3)}s\n`;
      logFileContent += `${"=".repeat(80)}\n`;
      logFileContent += `\n`;
      logFileContent += `Danh sách file theo thứ tự:\n`;
      logFileContent += `${"=".repeat(80)}\n\n`;

      originalFilesList.forEach((file, index) => {
        const fileName = path.basename(file);
        const fileDir = path.dirname(file);
        const sourceFolderName = path.basename(fileDir);

        logFileContent += `${index + 1}. ${fileName}\n`;
        logFileContent += `   Thư mục: ${sourceFolderName}\n`;
        logFileContent += `   Đường dẫn: ${file}\n\n`;
      });

      fs.writeFileSync(logFilePath, logFileContent, "utf-8");
      log(`[Run ${runIndex}] Đã tạo file log: ${logFileName}`);

      log(`✓ Hoàn thành Run ${runIndex}: ${finalOutputName}`, "success");

      return {
        path: finalOutputPath,
        duration: verify,
        name: finalOutputName,
        logFilePath: logFilePath,
        originalFiles: originalFilesList,
      };
    } catch (error) {
      log(`[Run ${runIndex}] Lỗi trong finalizeOutput: ${error.message}`, "error");

      // Dọn dẹp file tạm nếu có lỗi xảy ra
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (cleanupErr) {
        console.error("Lỗi khi dọn dẹp trong catch:", cleanupErr);
      }

      throw error; // Quăng lỗi để process:start xử lý tiếp
    }
  };

  // ==========================================
  // 🚀 MAIN
  // ==========================================

  try {
    // 0️⃣ Clean up any leftover temp files before starting
    cleanupTempFiles();

    if (!fs.existsSync(output)) {
      fs.mkdirSync(output, { recursive: true });
    }

    if (
      !fs.existsSync(input1.path) ||
      !fs.existsSync(input2.path)
    ) {
      throw new Error("Một hoặc nhiều thư mục đầu vào không tồn tại.");
    }

    const maxConcurrency = 5; // Giới hạn số luồng FFmpeg chạy song song
    const repeatMessage = repeatEnabled
      ? `lặp ${repeatCount} vòng`
      : "không lặp";
    log(`Bắt đầu xử lý ${runCount} lần (${repeatMessage})...`);

    const executing = new Set();
    const promises = [];

    for (let i = 1; i <= runCount; i++) {
      const p = processSingleRun(i).finally(() => executing.delete(p));
      promises.push(p);
      executing.add(p);
      if (executing.size >= maxConcurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(promises);

    // Final cleanup of any remaining temp files from THIS run session
    // (though they should have cleaned themselves up)
    cleanupTempFiles();

    sender.send(
      "process:complete",
      `Thành công! Đã tạo ${runCount} file output.`,
    );
  } catch (err) {
    log(`Error: ${err.message}`, "error");

    // Do NOT call cleanupTempFiles() here because other concurrent runs might still be finishing
    // and we don't want to delete their temp files while they are in the middle of processing.
    // They will be cleaned up the next time process:start is called.

    sender.send("process:error", err.message);
  }
});

// Device ID and Activation
ipcMain.handle("device:getId", async () => {
  try {
    const id = await machineId();
    return id;
  } catch (error) {
    console.error("Error getting device ID:", error);
    return null;
  }
});

ipcMain.handle("activation:check", async (event, deviceId) => {
  return {
    active: true,
    message: "Phần mềm đã được kích hoạt",
  }
  try {
    // Google Sheets CSV export URL
    const SHEET_ID = "1ZBWgZXISKT_dZGXlnp9ibB2PpypQepAJCppg3UEjl3k";
    const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

    const response = await axios.get(SHEET_CSV_URL, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (response.data && typeof response.data === "string") {
      // Parse CSV data
      const csvLines = response.data.split("\n");

      // Skip header row, check each line for device ID
      for (let i = 1; i < csvLines.length; i++) {
        const line = csvLines[i].trim();
        if (!line) continue;

        // Parse CSV row (assuming: Device ID, Expiry Date)
        const columns = line
          .split(",")
          .map((col) => col.replace(/"/g, "").trim());
        const sheetDeviceId = columns[0];
        const expiryDate = columns[2];

        if (sheetDeviceId === deviceId) {
          if (expiryDate && expiryDate !== "") {
            const expiry = new Date(expiryDate);
            const now = new Date();
            if (now > expiry) {
              return {
                active: false,
                message: "Thiết bị đã hết hạn kích hoạt",
              };
            }
          }

          return {
            active: true,
            message: "Thiết bị đã được kích hoạt",
          };
        }
      }

      return {
        active: false,
        message: "Thiết bị không có trong danh sách kích hoạt",
      };
    } else {
      return {
        active: false,
        message:
          "Không thể đọc dữ liệu từ Google Sheet. Vui lòng kiểm tra quyền truy cập.",
      };
    }
  } catch (error) {
    console.error("Error checking activation:", error);

    // Check if it's a permission/access error
    if (error.response) {
      if (error.response.status === 403) {
        return {
          active: false,
          message:
            "Google Sheet chưa được chia sẻ công khai. Vui lòng liên hệ quản trị viên.",
        };
      } else if (error.response.status === 404) {
        return {
          active: false,
          message: "Không tìm thấy Google Sheet. Vui lòng kiểm tra link.",
        };
      }
    }

    return {
      active: false,
      message: "Không thể kiểm tra kích hoạt. Vui lòng kiểm tra kết nối mạng.",
    };
  }
});
