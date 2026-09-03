@echo off
setlocal
title Digital Media - Local Database Server
cd /d "%~dp0"

REM ---------------------------------------------------------------
REM  This launcher is intentionally written in plain ASCII English.
REM  Windows CMD parses .bat files using the console code page, so a
REM  file containing Arabic text or emoji gets mangled into invalid
REM  commands on many machines ("... is not recognized as an internal
REM  or external command"). Keep this file ASCII-only.
REM ---------------------------------------------------------------

echo.
echo   ==================================================
echo    Digital Media - Local Database Server
echo   ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode

for /f "tokens=1,2 delims=v." %%a in ('node -v 2^>nul') do (
  set "MAJOR=%%a"
  set "MINOR=%%b"
)
if not defined MAJOR goto nonode

REM  The built-in node:sqlite module ships without a flag from 22.13 on.
if %MAJOR% LSS 22 goto oldnode
if %MAJOR% EQU 22 if %MINOR% LSS 13 goto oldnode

echo   Node.js detected. Starting the server...
echo.
node server.js
echo.
echo   The server has stopped.
pause
exit /b 0


:nonode
echo   [ ERROR ]  Node.js is NOT installed on this computer.
echo.
echo   How to fix it:
echo     1. Download the LTS version from   https://nodejs.org
echo     2. Run the installer and keep clicking Next.
echo     3. Close this window, then double-click this file again.
echo.
echo   Opening the download page in your browser...
start "" "https://nodejs.org/en/download"
echo.
pause
exit /b 1


:oldnode
echo   [ ERROR ]  Your Node.js version is too old.
echo.
echo   Installed version :
node -v
echo   Required version  : 22.13 or newer
echo.
echo   How to fix it:
echo     1. Download the LTS version from   https://nodejs.org
echo     2. Install it over your current version.
echo     3. Close this window, then double-click this file again.
echo.
echo   Opening the download page in your browser...
start "" "https://nodejs.org/en/download"
echo.
pause
exit /b 1
