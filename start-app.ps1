$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$viteScript = Join-Path $projectRoot "node_modules\vite\bin\vite.js"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

if (-not $nodeCommand) {
  Write-Host "Node.js was not found on PATH." -ForegroundColor Red
  Write-Host "For normal users, use release\\CSVDataCompare\\Start CSV Data Compare.bat after creating the portable package." -ForegroundColor Yellow
  Write-Host "For development, install Node.js LTS and run npm install." -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path $viteScript)) {
  Write-Host "node_modules was not found. Run npm install first." -ForegroundColor Red
  Write-Host "If npm is unavailable, install Node.js LTS: https://nodejs.org/" -ForegroundColor Yellow
  exit 1
}

Write-Host "Starting CSV Data Compare..." -ForegroundColor Cyan
Write-Host "Open http://127.0.0.1:5173/ in your browser." -ForegroundColor Green

& $nodeCommand.Source $viteScript --host 127.0.0.1 --port 5173
