@echo off
setlocal
cd /d "%~dp0"
set "PORT=8765"
set "ROOT=%~dp0app"
start "ENU CSV Compare Server" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Root "%ROOT%" -Port %PORT%
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"
