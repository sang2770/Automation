# WAV Mixer Electron

An automated tool to mix WAV files from 3 input folders based on user-defined counts and total duration.

## Features

- **3 Input Sources**: Select folders for Input 1, 2, and 3.
- **Random Selection**: Specify the number of files to pick from each folder.
- **Loop Mode**:
  - Automatically calculates ending duration (Input 3).
  - Loops Input 1 + Input 2 until the total duration is met.
  - Appends Input 3 as the ending.
- **No Loop Mode**: Concatenates selected files once (Input 1 -> Input 2 -> Input 3).
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
- WAV files in input folders.
