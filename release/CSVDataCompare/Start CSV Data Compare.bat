@echo off
setlocal
cd /d "%~dp0"
for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$port=8765; while ($port -lt 8865) { $listener = $null; try { $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), $port); $listener.Start(); $listener.Stop(); Write-Output $port; break } catch { if ($listener) { try { $listener.Stop() } catch {} }; $port += 1 } }"') do set "PORT=%%P"
if "%PORT%"=="" set "PORT=8765"
set "ROOT=%~dp0app"
echo http://127.0.0.1:%PORT%/>"%~dp0last-started-url.txt"
start "CSV Data Compare Server" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Root "%ROOT%" -Port %PORT%
timeout /t 2 /nobreak >nul
if not "%CSV_DATA_COMPARE_NO_OPEN%"=="1" start "" "http://127.0.0.1:%PORT%/"
