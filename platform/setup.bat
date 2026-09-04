@echo off
chcp 65001 >nul
REM ===========================================================================
REM  Media Monitoring Platform - Windows setup
REM
REM  Usage: double-click this file, or run from the terminal:  .\setup.bat
REM
REM  Bypasses the PowerShell execution-policy restriction for this run only.
REM  It does NOT change any security setting on your system.
REM ===========================================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
echo.
pause
