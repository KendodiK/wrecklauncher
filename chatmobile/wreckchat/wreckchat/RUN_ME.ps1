# WreckChat Installation Script (PowerShell)
# Run this script as Administrator

Write-Host ""
Write-Host "========================================"
Write-Host "     WreckChat - Installation Script"
Write-Host "========================================"
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please:" -ForegroundColor Yellow
    Write-Host "1. Right-click on this script"
    Write-Host "2. Select 'Run with PowerShell'"
    Write-Host "3. Click 'Run' when prompted"
    Write-Host ""
    Read-Host "Press ENTER to exit"
    exit 1
}

Write-Host "[1/4] Installing Uno Platform Workloads..." -ForegroundColor Green
Write-Host "This may take 5-15 minutes. Please wait..." -ForegroundColor Yellow
Write-Host ""

dotnet workload restore
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Workload installation failed!" -ForegroundColor Red
    Read-Host "Press ENTER to exit"
    exit 1
}

Write-Host ""
Write-Host "[2/4] Workloads installed successfully!" -ForegroundColor Green
Write-Host ""

Write-Host "[3/4] Building WreckChat project (desktop target)..." -ForegroundColor Green
cd "D:\sulis cucok\12\portfolio\wreckchat\wreckchat"

Write-Host "Cleaning project..." -ForegroundColor Yellow
dotnet clean
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Clean failed!" -ForegroundColor Red
    Read-Host "Press ENTER to exit"
    exit 1
}

Write-Host ""
Write-Host "Building project..." -ForegroundColor Yellow
dotnet build -f net10.0-desktop
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting tips:" -ForegroundColor Yellow
    Write-Host "1. Make sure you ran this script as Administrator"
    Write-Host "2. Wait for workload installation to complete"
    Write-Host "3. Check your internet connection"
    Write-Host "4. Try again in a few minutes"
    Read-Host "Press ENTER to exit"
    exit 1
}

Write-Host ""
Write-Host "[4/4] Build successful! Running app..." -ForegroundColor Green
Write-Host ""
Read-Host "Press ENTER to launch the app"

dotnet run -f net10.0-desktop

Write-Host ""
Write-Host "App closed. Setup complete!" -ForegroundColor Green
Read-Host "Press ENTER to exit"
