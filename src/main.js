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
      `wav_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`
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
      `trimmed_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`
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

  const processSingleRun = async (runIndex) => {
    log(`\n=== Bắt đầu lần chạy ${runIndex}/${runCount} ===`);

    const finalList = [];
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

    if (duration3 > duration) {
      throw new Error(
        `Input3 (${duration3.toFixed(
          3
        )}s) dài hơn duration yêu cầu (${duration}s). Không được cắt Input3.`
      );
    }

    const targetMainDuration = duration - duration3;

    log(
      `[Run ${runIndex}] Input3: ${duration3.toFixed(
        3
      )}s | Cần từ Input1+2: ${targetMainDuration.toFixed(3)}s`
    );

    // ==============================
    // 2️⃣ BUILD MAIN LIST (1+2) - CONVERT TO WAV AND HANDLE
    // ==============================

    let mainList = [];
    let currentDuration = 0;

    if (loop) {
      let safety = 0;

      while (currentDuration < targetMainDuration) {
        safety++;
        if (safety > 1000)
          throw new Error("Safety limit reached (1000 iterations)");

        const files1 = getRandomFiles(input1.path, input1.count);
        const files2 = getRandomFiles(input2.path, input2.count);

        if (files1.length === 0 && files2.length === 0)
          throw new Error("Không tìm thấy file trong Input1 hoặc Input2.");

        for (const file of [...files1, ...files2]) {
          // Convert to WAV first
          const wavFile = await convertToWav(file);
          wavFilesList.push(wavFile);
          
          const fileDuration = await getDuration(wavFile);

          if (currentDuration + fileDuration <= targetMainDuration) {
            mainList.push(wavFile);
            currentDuration += fileDuration;
          } else {
            const remain = targetMainDuration - currentDuration;

            if (remain > 0.001) { // More precise threshold for WAV
              const trimmedWav = await trimWavFile(wavFile, remain);
              wavFilesList.push(trimmedWav);
              
              mainList.push(trimmedWav);
              currentDuration += remain;

              log(
                `[Run ${runIndex}] Cắt file ${path.basename(
                  file
                )} lấy ${remain.toFixed(3)}s`
              );
            }

            break;
          }
        }
      }
    } else {
      // KHÔNG LOOP — chỉ lấy 1 lượt
      const files1 = getRandomFiles(input1.path, input1.count);
      const files2 = getRandomFiles(input2.path, input2.count);

      if (files1.length === 0 && files2.length === 0)
        throw new Error("Không tìm thấy file trong Input1 hoặc Input2.");

      for (const file of [...files1, ...files2]) {
        // Convert to WAV first
        const wavFile = await convertToWav(file);
        wavFilesList.push(wavFile);
        
        const fileDuration = await getDuration(wavFile);

        if (currentDuration + fileDuration <= targetMainDuration) {
          mainList.push(wavFile);
          currentDuration += fileDuration;
        } else {
          const remain = targetMainDuration - currentDuration;

          if (remain > 0.001) { // More precise threshold for WAV
            const trimmedWav = await trimWavFile(wavFile, remain);
            wavFilesList.push(trimmedWav);
            
            mainList.push(trimmedWav);
            currentDuration += remain;

            log(
              `[Run ${runIndex}] Cắt file ${path.basename(
                file
              )} lấy ${remain.toFixed(3)}s`
            );
          }

          break;
        }
      }
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

    const diff = Math.abs(verify - duration);

    if (diff > 0.001) { // More strict tolerance for WAV
      // Trim last file if possible
      const lastFile = finalList[finalList.length - 1];
      const lastDuration = await getDuration(lastFile);

      if (lastDuration > diff) {
        const trimmedFile = await trimWavFile(lastFile, lastDuration - diff);
        finalList[finalList.length - 1] = trimmedFile;
      } else {
        log(
          `[Run ${runIndex}] Cảnh báo: Không thể cắt file cuối để đạt đúng duration. Sai số: ${diff.toFixed(
            3
          )}s`
        );
      }
    }

    log(
      `[Run ${runIndex}] Duration cuối cùng: ${verify.toFixed(
        3
      )}s (chuẩn)`
    );

    // ==============================
    // 5️⃣ MERGE WAV FILES
    // ==============================

    const listPath = path.join(
      app.getPath("temp"),
      `concat_${runIndex}_${Date.now()}.txt`
    );

    const listContent = finalList
      .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
      .join("\n");

    fs.writeFileSync(listPath, listContent);

    // First create merged WAV file
    const tempWavOutput = path.join(
      app.getPath("temp"),
      `merged_${runIndex}_${Date.now()}.wav`
    );

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .audioCodec("pcm_s16le")
        .format("wav")
        .on("progress", (p) => {
          if (p.percent)
            log(`[Run ${runIndex}] Merging WAV: ${Math.floor(p.percent)}%`);
        })
        .on("error", reject)
        .on("end", resolve)
        .save(tempWavOutput);
    });

    // ==============================
    // 6️⃣ CONVERT FINAL WAV TO MP3
    // ==============================

    const outputName = `output_${runIndex}_${Date.now()}.mp3`;
    const outputPath = path.join(output, outputName);

    await new Promise((resolve, reject) => {
      ffmpeg(tempWavOutput)
        .audioCodec("libmp3lame")
        .audioBitrate("320k")
        .format("mp3")
        .on("progress", (p) => {
          if (p.percent)
            log(`[Run ${runIndex}] Converting to MP3: ${Math.floor(p.percent)}%`);
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

    const logFileName = outputName.replace(".mp3", "_log.txt");
    const logFilePath = path.join(output, logFileName);

    let logFileContent = "";

    // Header
    logFileContent += `Run: ${runIndex}/${runCount}\n`;
    logFileContent += `Output file: ${outputName}\n`;
    logFileContent += `Tổng số file ghép: ${finalList.length}\n`;
    logFileContent += `Duration target: ${duration}s\n`;
    logFileContent += `Duration actual: ${verify.toFixed(3)}s\n`;
    logFileContent += `${"=".repeat(80)}\n`;

    logFileContent += `\n`;
    logFileContent += `Danh sách file theo thứ tự (WAV processing):\n`;
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

    // ==============================
    // 7️⃣ CLEAN TEMP FILES
    // ==============================

    wavFilesList.forEach((f) => {
      try {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
        }
      } catch (err) {
        console.error(`Error cleaning up ${f}:`, err);
      }
    });

    log(`✓ Hoàn thành Run ${runIndex}: ${outputName}`, "success");

    return outputName;
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
      throw new Error("Một hoặc nhiều thư mục đầu vào không tồn tại.");
    }

    log(`Bắt đầu xử lý ${runCount} lần song song...`);

    const promises = [];
    for (let i = 1; i <= runCount; i++) {
      promises.push(processSingleRun(i));
    }

    await Promise.all(promises);

    sender.send(
      "process:complete",
      `Thành công! Đã tạo ${runCount} file output.`
    );
  } catch (err) {
    log(`Error: ${err.message}`, "error");
    sender.send("process:error", err.message);
  }
});


