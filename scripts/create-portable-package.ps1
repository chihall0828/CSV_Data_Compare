param(
  [string]$OutputRoot = "release",
  [string]$PackageName = "CSVDataCompare",
  [string]$NodePath = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$distRoot = Join-Path $projectRoot "dist"
$releaseRoot = Join-Path $projectRoot $OutputRoot
$packageRoot = Join-Path $releaseRoot $PackageName
$appRoot = Join-Path $packageRoot "app"
$zipPath = Join-Path $releaseRoot "$PackageName-portable.zip"

function Resolve-NodePath {
  param([string]$ExplicitPath)

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
    if (-not (Test-Path -LiteralPath $ExplicitPath -PathType Leaf)) {
      throw "NodePath was provided but was not found: $ExplicitPath"
    }
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }

  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  throw "Node.js was not found. Install Node.js, add it to PATH, or pass -NodePath to this script."
}

if (-not $SkipBuild) {
  $resolvedNode = Resolve-NodePath -ExplicitPath $NodePath
  $viteCli = Join-Path $projectRoot "node_modules\vite\bin\vite.js"
  if (-not (Test-Path -LiteralPath $viteCli -PathType Leaf)) {
    throw "Vite CLI was not found. Run npm install before packaging."
  }

  if (Test-Path -LiteralPath $distRoot) {
    $resolvedDist = (Resolve-Path -LiteralPath $distRoot).Path
    if (-not $resolvedDist.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove dist outside the project: $resolvedDist"
    }
    Remove-Item -LiteralPath $resolvedDist -Recurse -Force
  }

  Push-Location $projectRoot
  try {
    & $resolvedNode $viteCli build
    if ($LASTEXITCODE -ne 0) {
      throw "Vite build failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $distRoot -PathType Container)) {
  throw "dist was not found. Build did not produce a dist folder."
}

if (Test-Path -LiteralPath $packageRoot) {
  $resolvedPackage = (Resolve-Path -LiteralPath $packageRoot).Path
  if (-not $resolvedPackage.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a folder outside the project: $resolvedPackage"
  }
  Remove-Item -LiteralPath $resolvedPackage -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $appRoot | Out-Null
Copy-Item -Path (Join-Path $distRoot "*") -Destination $appRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "portable-server.ps1") -Destination (Join-Path $packageRoot "server.ps1") -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "start-portable.bat") -Destination (Join-Path $packageRoot "Start CSV Data Compare.bat") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "README.md") -Destination (Join-Path $packageRoot "README.md") -Force

$assetFiles = @()
$assetRoot = Join-Path $appRoot "assets"
if (Test-Path -LiteralPath $assetRoot -PathType Container) {
  $assetFiles = Get-ChildItem -LiteralPath $assetRoot -File | Sort-Object Name | ForEach-Object { $_.Name }
}

$buildInfo = [ordered]@{
  app = "CSV Data Compare"
  packageName = $PackageName
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  distIndexHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $appRoot "index.html")).Hash
  assets = $assetFiles
}
$buildInfo | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $appRoot "build-info.json") -Encoding UTF8

@"
CSV Data Compare Portable

How to start:
1. Double-click "Start CSV Data Compare.bat".
2. Your browser will open http://127.0.0.1:8765/.
3. Keep the server window open while using the app.
4. Close the server window when finished.

This portable package does not require Node.js or npm.
"@ | Set-Content -LiteralPath (Join-Path $packageRoot "README.txt") -Encoding UTF8

if (Test-Path -LiteralPath $zipPath) {
  $resolvedZip = (Resolve-Path -LiteralPath $zipPath).Path
  if (-not $resolvedZip.StartsWith($releaseRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a zip outside the release folder: $resolvedZip"
  }
  Remove-Item -LiteralPath $resolvedZip -Force
}

Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -Force

Write-Host "Portable folder: $packageRoot" -ForegroundColor Green
Write-Host "Portable zip: $zipPath" -ForegroundColor Green
