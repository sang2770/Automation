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
    output,
    loop,
    duration,
    runCount = 1,
    enableOutput2,
    output2Input1,
    output2Input2,
    output2Input3,
  } = config;

  const sender = event.sender;

  const log = (msg, type = "info") => {
    sender.send("log:update", { text: msg, type });
  };

  const processSingleRun = async (runIndex) => {
    log(`\n=== Bắt đầu lần chạy ${runIndex}/${runCount} ===`);

    if (enableOutput2) {
      // Process both Output 1 and Output 2
      return await processDualOutput(runIndex);
    } else {
      // Original single output processing
      return await processSingleOutput(runIndex);
    }
  };

  const processSingleOutput = async (runIndex) => {
    const finalList = [];
    const originalFilesList = []; // Track original MP3 file paths
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

    if (loop && duration3 > duration) {
      throw new Error(
        `Input3 (${duration3.toFixed(
          3,
        )}s) dài hơn duration yêu cầu (${duration}s). Không được cắt Input3.`,
      );
    }

    const targetMainDuration = loop ? duration - duration3 : 0;

    log(
      `[Run ${runIndex}] Input3: ${duration3.toFixed(
        3,
      )}s | Cần từ Input1+2: ${loop ? targetMainDuration.toFixed(3) : "không giới hạn"}s`,
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
            originalFilesList.push(file); // Track original MP3
            currentDuration += fileDuration;
          } else {
            const remain = targetMainDuration - currentDuration;

            if (remain > 0.001) {
              // More precise threshold for WAV
              const trimmedWav = await trimWavFile(wavFile, remain);
              wavFilesList.push(trimmedWav);

              mainList.push(trimmedWav);
              originalFilesList.push(file + ` (cắt ${remain.toFixed(3)}s)`); // Track with trim info
              currentDuration += remain;

              log(
                `[Run ${runIndex}] Cắt file ${path.basename(
                  file,
                )} lấy ${remain.toFixed(3)}s`,
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

        mainList.push(wavFile);
        originalFilesList.push(file); // Track original MP3
        currentDuration += await getDuration(wavFile);
      }
    }

    // ==============================
    // 3️⃣ GHÉP ENDING
    // ==============================

    finalList.push(...mainList);
    finalList.push(...wavFiles3);

    // ==============================
    // 4️⃣ VERIFY FINAL DURATION (only for loop mode)
    // ==============================

    let verify = 0;
    for (const f of finalList) {
      verify += await getDuration(f);
    }

    if (loop) {
      const diff = Math.abs(verify - duration);

      if (diff > 0.001) {
        // More strict tolerance for WAV
        // Trim last file if possible
        const lastFile = finalList[finalList.length - 1];
        const lastDuration = await getDuration(lastFile);

        if (lastDuration > diff) {
          const trimmedFile = await trimWavFile(lastFile, lastDuration - diff);
          finalList[finalList.length - 1] = trimmedFile;
        } else {
          log(
            `[Run ${runIndex}] Cảnh báo: Không thể cắt file cuối để đạt đúng duration. Sai số: ${diff.toFixed(
              3,
            )}s`,
          );
        }
      }
    }

    log(`[Run ${runIndex}] Duration cuối cùng: ${verify.toFixed(3)}s`);
    originalFilesList.push(...files3);
    return await finalizeOutput(
      runIndex,
      finalList,
      originalFilesList,
      wavFilesList,
      verify,
    );
  };

  const processDualOutput = async (runIndex) => {
    log(`[Run ${runIndex}] Chế độ Output 2 được bật`);

    // ==============================
    // STEP 1: Create Output 1 (normal processing)
    // ==============================

    log(`[Run ${runIndex}] Tạo Output 1...`);
    const output1Result = await processSingleOutput(runIndex);
    const output1Duration = output1Result.duration;

    log(
      `[Run ${runIndex}] Output 1 hoàn thành với thời lượng: ${output1Duration.toFixed(3)}s`,
    );

    // ==============================
    // STEP 2: Create Output 2 with same duration as Output 1
    // ==============================

    log(
      `[Run ${runIndex}] Tạo Output 2 với thời lượng ${output1Duration.toFixed(3)}s...`,
    );

    const finalList2 = [];
    const originalFilesList2 = []; // Track original MP3 file paths for Output 2
    const wavFilesList2 = [];

    // Get Output 2 ending files
    const files2_3 = getRandomFiles(output2Input3.path, output2Input3.count);
    if (files2_3.length === 0)
      throw new Error("Không tìm thấy file trong Output2 Input 3.");

    const wavFiles2_3 = [];
    let duration2_3 = 0;

    for (const f of files2_3) {
      const wavFile = await convertToWav(f);
      wavFilesList2.push(wavFile);
      wavFiles2_3.push(wavFile);
      originalFilesList2.push(f); // Track original MP3
      duration2_3 += await getDuration(wavFile);
    }

    const targetMainDuration2 = output1Duration - duration2_3;

    if (targetMainDuration2 < 0) {
      log(
        `[Run ${runIndex}] Cảnh báo: Output2 Input3 dài hơn Output1. Sẽ cắt Output2 Input3.`,
        "warning",
      );
      // Trim the ending files to fit
      const trimmedFile = await trimWavFile(wavFiles2_3[0], output1Duration);
      wavFilesList2.push(trimmedFile);
      finalList2.push(trimmedFile);
      // Update original files list to reflect the trimming - only keep the first file that was trimmed
      originalFilesList2[0] =
        originalFilesList2[0] + ` (cắt để khớp ${output1Duration.toFixed(3)}s)`;
    } else {
      // Build main list for Output 2
      let mainList2 = [];
      let currentDuration2 = 0;
      let safety = 0;

      while (currentDuration2 < targetMainDuration2) {
        safety++;
        if (safety > 1000)
          throw new Error("Safety limit reached (1000 iterations) for Output2");

        const files2_1 = getRandomFiles(
          output2Input1.path,
          output2Input1.count,
        );
        const files2_2 = getRandomFiles(
          output2Input2.path,
          output2Input2.count,
        );

        if (files2_1.length === 0 && files2_2.length === 0)
          throw new Error(
            "Không tìm thấy file trong Output2 Input1 hoặc Input2.",
          );
        for (const file of [...files2_1, ...files2_2]) {
          mainList2.push(file);
          currentDuration2 += await getDuration(file);
          originalFilesList2.push(file); // Track original MP3 for Output 2
          if (currentDuration2 >= targetMainDuration2) break;
        }
      }
      const mainList2Wav = [];
      await Promise.all(
        mainList2.map(async (file) => {
          mainList2Wav.push(await convertToWav(file));
        }),
      );
      if (currentDuration2 > targetMainDuration2) {
        const lastFile = mainList2Wav[mainList2Wav.length - 1];
        const lastDuration = await getDuration(lastFile);
        const excess = currentDuration2 - targetMainDuration2;
        const trimmedFile = await trimWavFile(lastFile, lastDuration - excess);
        mainList2Wav[mainList2Wav.length - 1] = trimmedFile;
        log(
          `[Run ${runIndex}] Cắt file cuối của Output 2 để khớp thời lượng với Output 1, cắt ${excess.toFixed(3)}s`,
        );
      }
      finalList2.push(...mainList2Wav);
      finalList2.push(...wavFiles2_3);
    }

    // ==============================
    // STEP 3: Merge Output 2
    // ==============================

    const output2Result = await finalizeOutput(
      `${runIndex}_output2`,
      finalList2,
      originalFilesList2,
      wavFilesList2,
      output1Duration,
    );

    // ==============================
    // STEP 4: Concatenate Output2 + Output1
    // ==============================

    log(`[Run ${runIndex}] Nối Output2 + Output1...`);

    const finalOutputName = `output_${runIndex}_${Date.now()}.mp3`;
    const finalOutputPath = path.join(output, finalOutputName);

    // Create concat list
    const concatListPath = path.join(
      app.getPath("temp"),
      `final_concat_${runIndex}_${Date.now()}.txt`,
    );

    const concatContent = [
      `file '${output2Result.path.replace(/'/g, "'\\''")}'`,
      `file '${output1Result.path.replace(/'/g, "'\\''")}'`,
    ].join("\n");

    fs.writeFileSync(concatListPath, concatContent);

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .audioCodec("libmp3lame")
        .audioBitrate("320k")
        .format("mp3")
        .on("progress", (p) => {
          if (p.percent)
            log(`[Run ${runIndex}] Nối cuối cùng: ${Math.floor(p.percent)}%`);
        })
        .on("error", reject)
        .on("end", resolve)
        .save(finalOutputPath);
    });

    // Clean up temp files
    fs.unlinkSync(concatListPath);
    fs.unlinkSync(output1Result.path);
    fs.unlinkSync(output2Result.path);
    if (output1Result.logFilePath) fs.unlinkSync(output1Result.logFilePath);
    if (output2Result.logFilePath) fs.unlinkSync(output2Result.logFilePath);

    // Additional cleanup for any remaining WAV files
    log(`[Run ${runIndex}] Dọn dẹp các file tạm thời...`);

    // ==============================
    // STEP 5: Create final log file for dual output
    // ==============================

    const logFileName = finalOutputName.replace(".mp3", "_log.txt");
    const logFilePath = path.join(output, logFileName);

    let logFileContent = "";

    // Header
    logFileContent += `Run: ${runIndex}/${runCount} (Dual Output Mode)\n`;
    logFileContent += `Output file: ${finalOutputName}\n`;
    logFileContent += `Output 1 Duration: ${output1Duration.toFixed(3)}s\n`;
    logFileContent += `Output 2 Duration: ${output1Duration.toFixed(3)}s\n`;
    logFileContent += `Total Duration: ${(output1Duration * 2).toFixed(3)}s\n`;
    logFileContent += `${"=".repeat(80)}\n\n`;

    logFileContent += `Cấu trúc: Output 2 + Output 1\n`;
    logFileContent += `- Output 2 được tạo với cùng thời lượng như Output 1\n`;
    logFileContent += `- Kết quả cuối là nối Output 2 + Output 1\n\n`;

    logFileContent += `Chi tiết xử lý:\n`;
    logFileContent += `- Output 1: Xử lý từ Input 1, 2, 3 (chế độ ${loop ? "lặp" : "không lặp"})\n`;
    logFileContent += `- Output 2: Xử lý từ Output2 Input 1, 2, 3 với thời lượng khớp Output 1\n`;
    logFileContent += `- Ghép cuối: Output 2 + Output 1\n`;

    // List files for Output 1
    logFileContent += `\n${"-".repeat(80)}\n`;
    logFileContent += `Danh sách file Output 1 (theo thứ tự):\n`;
    logFileContent += `${"-".repeat(80)}\n\n`;
    output1Result.originalFiles.forEach((file, index) => {
      const fileName = path.basename(file);
      const fileDir = path.dirname(file);
      const sourceFolderName = path.basename(fileDir);
      logFileContent += `${index + 1}. ${fileName}\n`;
      logFileContent += `   Thư mục: ${sourceFolderName}\n`;
      logFileContent += `   Đường dẫn: ${file}\n\n`;
    });

    fs.writeFileSync(logFilePath, logFileContent, "utf-8");
    log(`[Run ${runIndex}] Đã tạo file log: ${logFileName}`);

    const totalDuration = output1Duration * 2;
    log(
      `✓ Hoàn thành Run ${runIndex}: ${finalOutputName} (${totalDuration.toFixed(3)}s)`,
      "success",
    );

    return finalOutputName;
  };

  const finalizeOutput = async (
    runIndex,
    finalList,
    originalFilesList,
    wavFilesList,
    verify,
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
            log(`[Run ${runIndex}] Merging WAV: ${Math.floor(p.percent)}%`);
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
              `[Run ${runIndex}] Converting to MP3: ${Math.floor(p.percent)}%`,
            );
        })
        .on("error", reject)
        .on("end", resolve)
        .save(outputPath);
    });

    fs.unlinkSync(listPath);
    fs.unlinkSync(tempWavOutput);

    // ==============================
    // 📝 EXPORT TXT DANH SÁCH GHÉP (only for final outputs, not temp)
    // ==============================

    if (!runIndex.toString().includes("output2")) {
      // Only create log for final outputs, not intermediate temp files
      const finalOutputName = `output_${runIndex}_${Date.now()}.mp3`;
      const finalOutputPath = path.join(output, finalOutputName);

      // Copy temp file to final location
      fs.copyFileSync(outputPath, finalOutputPath);

      const logFileName = finalOutputName.replace(".mp3", "_log.txt");
      const logFilePath = path.join(output, logFileName);

      let logFileContent = "";

      // Header
      logFileContent += `Run: ${runIndex}/${runCount}\n`;
      logFileContent += `Output file: ${finalOutputName}\n`;
      logFileContent += `Tổng số file ghép: ${finalList.length}\n`;
      logFileContent += `Duration target: ${loop ? duration : "không giới hạn"}s\n`;
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

      // Clean up temp file
      fs.unlinkSync(outputPath);

      log(`✓ Hoàn thành Run ${runIndex}: ${finalOutputName}`, "success");

      return {
        path: finalOutputPath,
        duration: verify,
        name: finalOutputName,
        logFilePath: logFilePath,
        originalFiles: originalFilesList,
      };
    }

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

    log(
      `[Run ${runIndex}] Đã dọn dẹp ${wavFilesList.length} file WAV tạm thời`,
    );

    return { path: outputPath, duration: verify, name: outputName, originalFiles: originalFilesList };
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

    if (enableOutput2) {
      if (
        !fs.existsSync(output2Input1.path) ||
        !fs.existsSync(output2Input2.path) ||
        !fs.existsSync(output2Input3.path)
      ) {
        throw new Error(
          "Một hoặc nhiều thư mục đầu vào Output 2 không tồn tại.",
        );
      }
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
      `Thành công! Đã tạo ${runCount} file output.`,
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
