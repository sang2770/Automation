# YouTube Automation Tool

A powerful Electron application for automating YouTube video views with GPM proxy support.

## Features

- **Dual Method Automation**: Two different approaches for viewing YouTube videos
  - Method 1: Search keyword → Click first video → Navigate to target video
  - Method 2: Direct navigation to target video
- **GPM Integration**: Full support for GPMLogin proxy management
- **Multi-threading**: Run multiple automation workers simultaneously
- **Keyword Support**: Use keywords for organic search-based automation
- **Ad Handling**: Automatically detect and interact with ads
- **Real-time Monitoring**: Live progress tracking and detailed logs
- **User-friendly Interface**: Modern Electron-based GUI

## Installation

1. Clone or extract the project
2. Install dependencies:
   ```bash
   npm install
   ```

## Prerequisites

- **GPMLogin**: Must be running on port 19995 with configured profiles
- **Node.js**: Version 16 or higher
- **Chrome/Chromium**: For browser automation

## Usage

1. Start GPMLogin application
2. Run the application:
   ```bash
   npm start
   ```
3. Configure your settings:
   - Add YouTube links with view counts
   - Set keywords for each link
   - Select GPM profiles to use
   - Adjust automation settings

4. Click "Start Automation" to begin

## Configuration

### Links & Keywords

- **URL**: YouTube video link to view
- **Views**: Number of times to view the video
- **Keywords**: Search terms for Method 1 automation
- **Enabled**: Toggle individual links on/off

### Settings

- **Max Threads**: Number of concurrent workers
- **Delay Between Actions**: Wait time between automation steps
- **Wait for Ads**: Enable ad detection
- **Click Ads**: Automatically click detected ads
- **Random Method**: Randomly choose between Method 1 and Method 2

### GPM Profiles

Select one or more GPM profiles to use for automation. Each worker will use a different profile for better anonymity.

## Automation Methods

### Method 1: Keyword Search

1. Navigate to YouTube homepage
2. Search for a random keyword from the link configuration
3. Click on the first video result
4. Navigate to the target video
5. Handle ads if present
6. Watch for a random duration

### Method 2: Direct Navigation

1. Navigate to YouTube homepage
2. Directly navigate to the target video
3. Handle ads if present
4. Watch for a random duration

## Building

To build the application for distribution:

```bash
# For current platform
npm run build

# For specific platforms
npm run build-win    # Windows
npm run build-mac    # macOS
npm run build-linux  # Linux
```

## Development

Run in development mode:

```bash
npm run dev
```

## Troubleshooting

### GPM Connection Issues

- Ensure GPMLogin is running on port 19995
- Check that profiles are properly configured in GPMLogin
- Verify proxy settings are correct

### Browser Issues

- Make sure Chrome/Chromium is installed
- Check that GPM profiles can launch browsers successfully
- Ensure sufficient system resources for multiple browser instances

### Automation Issues

- Verify YouTube links are valid and accessible
- Check internet connection stability
- Adjust delay settings if automation is too fast
- Monitor logs for specific error messages

## Safety Features

- Randomized delays to simulate human behavior
- Multiple automation methods for variety
- Proxy rotation through GPM profiles
- Error handling and recovery mechanisms
- Respectful rate limiting

## License

MIT License - See LICENSE file for details

## Support

For technical support or questions about this automation tool, please check the logs for detailed error messages and ensure all prerequisites are properly configured.
