@echo off
echo Building Electron application...

REM Copy package.json for electron
copy electron-package.json package.json

echo Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo Failed to install dependencies
    pause
    exit /b %errorlevel%
)

echo Building application...
call npm run build

if %errorlevel% neq 0 (
    echo Failed to build application
    pause
    exit /b %errorlevel%
)

echo Build completed! Check the 'dist' folder for the executable.
pause
