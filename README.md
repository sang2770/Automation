# WAV Mixer Electron

An automated tool to mix MP3/WAV files from 2 input folders based on user-defined counts.

## Features

- **2 Input Sources**: Select folders for Input 1 and 2.
- **Random Selection**: Specify the number of songs to pick randomly, without duplicates, from each folder on every run.
- **MP3 and WAV**: Accepts `.mp3` and `.wav` files, including mixed formats across the two inputs.
- **Loop Mode**: Tick the repeat checkbox to concatenate Input 1 + Input 2 for the selected number of cycles.
- **No Loop Mode**: Concatenates selected files once (Input 1 -> Input 2).
- **Audio Processing**: Uses `fluent-ffmpeg` for seamless concatenation.

## How to Run

1. Open a terminal in this directory.
2. Install dependencies (if not already):
   ```bash
   npm install
   ```
3. Start the application:
   ```bash
   npm start
   ```

## Requirements

- Node.js
- MP3 or WAV files in input folders.
