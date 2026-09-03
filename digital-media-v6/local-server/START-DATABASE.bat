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
echo    Digital Media - Local Database Server (PostgreSQL)
echo   ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode

if not exist node_modules (
  echo   Installing dependencies (first run only)...
  echo.
  call npm install
  if errorlevel 1 goto installfailed
  echo.
)

echo   Starting the server...
echo   (If PostgreSQL is not running or not set up yet, the error
echo    below will say exactly what to fix - see README.md.)
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


:installfailed
echo.
echo   [ ERROR ]  Could not install dependencies. Check your internet
echo   connection and try again.
echo.
pause
exit /b 1
