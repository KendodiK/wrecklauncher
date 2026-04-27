@echo off
REM Windows Batch Script to Run WreckChat Setup

echo.
echo ========================================
echo     WreckChat - Installation Script
echo ========================================
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator!
    echo.
    echo Please:
    echo 1. Right-click on this script
    echo 2. Select "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo [1/4] Installing Uno Platform Workloads...
echo This may take 5-15 minutes. Please wait...
echo.
dotnet workload restore
if %errorLevel% neq 0 (
    echo ERROR: Workload installation failed!
    pause
    exit /b 1
)

echo.
echo [2/4] Workloads installed successfully!
echo.

echo [3/4] Building WreckChat project (desktop target)...
cd "D:\sulis cucok\12\portfolio\wreckchat\wreckchat"
dotnet clean
if %errorLevel% neq 0 (
    echo ERROR: Clean failed!
    pause
    exit /b 1
)

dotnet build -f net10.0-desktop
if %errorLevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo [4/4] Build successful! Running app...
echo.

cd "D:\sulis cucok\12\portfolio\wreckchat\wreckchat"
dotnet run -f net10.0-desktop

echo.
echo App closed. Setup complete!
pause
