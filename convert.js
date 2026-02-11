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
