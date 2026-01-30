@echo off
echo Installing Electron dependencies...
call npm install

if %errorlevel% neq 0 (
    echo Failed to install dependencies
    pause
    exit /b %errorlevel%
)

echo Starting Electron application...
call npm start

pause
