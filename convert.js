const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;

// Gán đường dẫn ffmpeg và ffprobe cho fluent-ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Convert MP3 -> WAV
ffmpeg("./music/3.mp3")
  .toFormat("wav")
  .save("./music/3.wav")
  .on("end", () => {
    console.log("Conversion finished!");
  })
  .on("error", (err) => {
    console.error("Error: " + err.message);
  });

// Convert MP3 -> WAV
ffmpeg("./music/1.mp3")
  .toFormat("wav")
  .save("./music/1.wav")
  .on("end", () => {
    console.log("Conversion finished!");
  })
  .on("error", (err) => {
    console.error("Error: " + err.message);
  });

ffmpeg("./music/2.mp3")
  .toFormat("wav")
  .save("./music/2.wav")
  .on("end", () => {
    console.log("Conversion finished!");
  })
  .on("error", (err) => {
    console.error("Error: " + err.message);
  });
