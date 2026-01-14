# Qala CLI Install Script for Windows
# Creates a global 'qala' command pointing to this repo's built CLI

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$QalaBin = Join-Path $ScriptDir "dist\bin\qala.js"
$InstallDir = Join-Path $env:USERPROFILE ".qala\bin"
$InstallPath = Join-Path $InstallDir "qala.cmd"

Write-Host "Installing Qala CLI..." -ForegroundColor Cyan
Write-Host ""

# Build first if needed
if (-not (Test-Path $QalaBin)) {
    Write-Host "Building TypeScript..." -ForegroundColor Yellow
    Push-Location $ScriptDir
    npm run build
    Pop-Location
}

# Create install directory if it doesn't exist
if (-not (Test-Path $InstallDir)) {
    Write-Host "Creating install directory at $InstallDir..."
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# Create wrapper batch file
Write-Host "Creating global command at $InstallPath..."

$WrapperContent = @"
@echo off
node "$QalaBin" %*
"@

Set-Content -Path $InstallPath -Value $WrapperContent -Encoding ASCII

# Check if install directory is in PATH
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    Write-Host ""
    Write-Host "Adding $InstallDir to user PATH..." -ForegroundColor Yellow
    $NewPath = "$UserPath;$InstallDir"
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    Write-Host "PATH updated. Please restart your terminal for changes to take effect." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done! Qala CLI installed." -ForegroundColor Green
Write-Host ""
Write-Host "Try it out (after restarting terminal if PATH was updated):"
Write-Host "  qala --help" -ForegroundColor White
Write-Host "  qala list" -ForegroundColor White
Write-Host ""
Write-Host "To uninstall:" -ForegroundColor Gray
Write-Host "  Remove-Item `"$InstallPath`"" -ForegroundColor Gray
Write-Host "  # Optionally remove $InstallDir from PATH" -ForegroundColor Gray
