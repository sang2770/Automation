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

// Helper: Get random files from folder
function getRandomFiles(dir, count) {
  try {
    if (!fs.existsSync(dir)) return [];

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".mp3"));

    if (files.length === 0) return [];

    const selected = new Set();

    while (selected.size < Math.min(count, files.length)) {
      const randomIndex = Math.floor(Math.random() * files.length);
      selected.add(files[randomIndex]);
    }

    return [...selected].map((f) => path.join(dir, f));
  } catch (err) {
    console.error(`Error reading dir ${dir}:`, err);
    return [];
  }
}

// Helper: Convert MP3 to WAV for precise duration handling
function convertToWav(inputPath) {
  return new Promise((resolve, reject) => {
    const tempDir = app.getPath("temp");
    const wavPath = path.join(
      tempDir,
      `wav_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`,
    );

    ffmpeg(inputPath)
      .audioCodec("pcm_s16le")
      .audioFrequency(44100)
      .audioChannels(2)
      .format("wav")
      .on("end", () => resolve(wavPath))
      .on("error", reject)
      .save(wavPath);
  });
}

// Helper: Get Duration of a file (Promisified) - More precise with WAV
function getDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return resolve(0); // If error, assume 0 to not break loop
      resolve(metadata.format.duration || 0);
    });
  });
}

// Helper: Trim WAV file to exact duration
function trimWavFile(inputPath, duration) {
  return new Promise((resolve, reject) => {
    const tempDir = app.getPath("temp");
    const trimmedPath = path.join(
      tempDir,
      `trimmed_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`,
    );

    ffmpeg(inputPath)
      .setStartTime(0)
      .duration(duration)
      .audioCodec("pcm_s16le")
      .format("wav")
      .on("end", () => resolve(trimmedPath))
      .on("error", reject)
      .save(trimmedPath);
  });
}

// Helper: Clean up all temp WAV and audio files
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
        console.error(`Error cleaning temp file ${file}:`, err);
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
    input3,
    group2input1,
    group2input2,
    output,
    runCount = 1,
  } = config;

  const sender = event.sender;

  const log = (msg, type = "info") => {
    sender.send("log:update", { text: msg, type });
  };

  const processSingleRun = async (runIndex) => {
    log(`\n=== Bắt đầu lần chạy ${runIndex}/${runCount} ===`);
    const g1Result = await processSingleOutput(runIndex);
    log(`[Run ${runIndex}] Bắt đầu tạo Output 2 (Group 2)...`);
    await processGroup2Output(runIndex, g1Result.group2SourceFiles);
  };

  const processSingleOutput = async (runIndex) => {
    const finalList = [];
    const originalFilesList = []; // Track all original MP3 file paths for Group 1 output log
    const group2SourceFiles = []; // Track only files that Group 2 should mirror
    const wavFilesList = []; // Track WAV files for cleanup

    // ==============================
    // 1️⃣ LẤY INPUT 3 (ENDING) - CONVERT TO WAV
    // ==============================

    const files3 = getRandomFiles(input3.path, input3.count);
    if (files3.length === 0)
      throw new Error("Không tìm thấy file trong Input 3.");

    log(`[Run ${runIndex}] Đang chuyển đổi Input3 files sang WAV...`);
    const wavFiles3 = [];
    let duration3 = 0;

    for (const f of files3) {
      const wavFile = await convertToWav(f);
      wavFilesList.push(wavFile);
      wavFiles3.push(wavFile);
      duration3 += await getDuration(wavFile);
    }

    log(
      `[Run ${runIndex}] Input3: ${duration3.toFixed(3)}s`,
    );

    // ==============================
    // 2️⃣ BUILD MAIN LIST (1+2) - CONVERT TO WAV AND HANDLE
    // ==============================

    let mainList = [];
    let currentDuration = 0;

    // KHÔNG LOOP — chỉ lấy 1 lượt
    const files1 = getRandomFiles(input1.path, input1.count);
    const files2 = getRandomFiles(input2.path, input2.count);

    if (files1.length === 0 && files2.length === 0)
      throw new Error("Không tìm thấy file trong Input1 hoặc Input2.");

    for (const file of [...files1, ...files2]) {
      // Convert to WAV first
      const wavFile = await convertToWav(file);
      wavFilesList.push(wavFile);

      mainList.push(wavFile);
      originalFilesList.push(file); // Track original MP3
      group2SourceFiles.push(file);
      currentDuration += await getDuration(wavFile);
    }

    // ==============================
    // 3️⃣ GHÉP ENDING
    // ==============================

    finalList.push(...mainList);
    finalList.push(...wavFiles3);

    // ==============================
    // 4️⃣ VERIFY FINAL DURATION
    // ==============================

    let verify = 0;
    for (const f of finalList) {
      verify += await getDuration(f);
    }

    log(`[Run ${runIndex}] Duration cuối cùng: ${verify.toFixed(3)}s`);
    originalFilesList.push(...files3);
    const g1Output = await finalizeOutput(
      runIndex,
      finalList,
      originalFilesList,
      wavFilesList,
      verify,
      'G1',
    );

    return {
      ...g1Output,
      group2SourceFiles,
    };
  };

  const processGroup2Output = async (runIndex, group1Files) => {
    const wavFilesList = [];
    const originalFilesList2 = [];
    const finalList = [];

    log(`[Run ${runIndex}] Tạo Output 2 từ danh sách bài của Output 1...`);

    for (const origFile of group1Files) {
      const fileName = path.basename(origFile);
      const normalizedOrig = path.normalize(origFile);

      let g2Dir = null;
      if (normalizedOrig.startsWith(path.normalize(input1.path) + path.sep))
        g2Dir = group2input1.path;
      else if (normalizedOrig.startsWith(path.normalize(input2.path) + path.sep))
        g2Dir = group2input2.path;

      if (!g2Dir)
        throw new Error(`Không thể xác định thư mục Group 2 cho file: ${fileName}`);

      const g2FilePath = path.join(g2Dir, fileName);
      if (!fs.existsSync(g2FilePath))
        throw new Error(`Group 2 thiếu file: "${fileName}" trong "${g2Dir}"`);

      const wavFile = await convertToWav(g2FilePath);
      wavFilesList.push(wavFile);
      finalList.push(wavFile);
      originalFilesList2.push(g2FilePath);
    }

    let verify = 0;
    for (const f of finalList) verify += await getDuration(f);
    log(`[Run ${runIndex}] Group 2 Duration: ${verify.toFixed(3)}s`);

    return await finalizeOutput(runIndex, finalList, originalFilesList2, wavFilesList, verify, 'G2');
  };

  const finalizeOutput = async (
    runIndex,
    finalList,
    originalFilesList,
    wavFilesList,
    verify,
    label = 'G1',
  ) => {
    // ==============================
    // 5️⃣ MERGE WAV FILES
    // ==============================

    const listPath = path.join(
      app.getPath("temp"),
      `concat_${runIndex}_${Date.now()}.txt`,
    );

    const listContent = finalList
      .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
      .join("\n");

    fs.writeFileSync(listPath, listContent);

    // First create merged WAV file
    const tempWavOutput = path.join(
      app.getPath("temp"),
      `merged_${runIndex}_${Date.now()}.wav`,
    );

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .audioCodec("pcm_s16le")
        .format("wav")
        .on("progress", (p) => {
          if (p.percent)
            log(`[Run ${runIndex}] Merging WAV (${label}): ${Math.floor(p.percent)}%`);
        })
        .on("error", reject)
        .on("end", resolve)
        .save(tempWavOutput);
    });

    // ==============================
    // 6️⃣ CONVERT FINAL WAV TO MP3
    // ==============================

    const outputName = `temp_output_${runIndex}_${Date.now()}.mp3`;
    const outputPath = path.join(app.getPath("temp"), outputName);

    await new Promise((resolve, reject) => {
      ffmpeg(tempWavOutput)
        .audioCodec("libmp3lame")
        .audioBitrate("320k")
        .format("mp3")
        .on("progress", (p) => {
          if (p.percent)
            log(
              `[Run ${runIndex}] Converting to MP3 (${label}): ${Math.floor(p.percent)}%`,
            );
        })
        .on("error", reject)
        .on("end", resolve)
        .save(outputPath);
    });

    fs.unlinkSync(listPath);
    fs.unlinkSync(tempWavOutput);

    // ==============================
    // 📝 EXPORT TXT DANH SÁCH GHÉP
    // ==============================

    const suffix = label === 'G2' ? '_G2' : '';
    const finalOutputName = `output_${runIndex}${suffix}_${Date.now()}.mp3`;
    const finalOutputPath = path.join(output, finalOutputName);

    // Copy temp file to final location
    fs.copyFileSync(outputPath, finalOutputPath);
    fs.unlinkSync(outputPath);

    // Cleanup WAV temp files
    wavFilesList.forEach((f) => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (err) { }
    });

    const logFileName = finalOutputName.replace(".mp3", "_log.txt");
    const logFilePath = path.join(output, logFileName);

    let logFileContent = "";
    logFileContent += `Run: ${runIndex}/${runCount} (${label})\n`;
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
    log(`[Run ${runIndex}] Đã tạo file log (${label}): ${logFileName}`);

    log(`✓ Hoàn thành Run ${runIndex} (${label}): ${finalOutputName}`, "success");

    return {
      path: finalOutputPath,
      duration: verify,
      name: finalOutputName,
      logFilePath: logFilePath,
      originalFiles: originalFilesList,
    };
  };

  // ==========================================
  // 🚀 MAIN
  // ==========================================

  try {
    if (
      !fs.existsSync(input1.path) ||
      !fs.existsSync(input2.path) ||
      !fs.existsSync(input3.path)
    ) {
      throw new Error("Một hoặc nhiều thư mục đầu vào Group 1 không tồn tại.");
    }

    if (
      !fs.existsSync(group2input1.path) ||
      !fs.existsSync(group2input2.path)
    ) {
      throw new Error("Một hoặc nhiều thư mục đầu vào Group 2 không tồn tại.");
    }

    log(`Bắt đầu xử lý ${runCount} lần song song...`);

    const promises = [];
    for (let i = 1; i <= runCount; i++) {
      promises.push(processSingleRun(i));
    }

    await Promise.all(promises);

    // Final cleanup of any remaining temp files
    cleanupTempFiles();

    sender.send(
      "process:complete",
      `Thành công! Đã tạo ${runCount * 2} file output (${runCount} G1 + ${runCount} G2).`,
    );
  } catch (err) {
    log(`Error: ${err.message}`, "error");

    // Cleanup temp files even on error
    cleanupTempFiles();

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
