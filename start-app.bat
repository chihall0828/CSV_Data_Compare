@echo off
cd /d "%~dp0"
start "CSV Data Compare Server" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0start-app.ps1"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173/"
