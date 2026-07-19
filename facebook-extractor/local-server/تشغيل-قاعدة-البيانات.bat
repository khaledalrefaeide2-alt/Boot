@echo off
chcp 65001 >nul
title FB Extractor - قاعدة البيانات المحلية
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  ❌ Node.js غير مثبت على هذا الجهاز.
  echo  حمّله مجاناً من: https://nodejs.org  ثم أعد تشغيل هذا الملف.
  echo.
  pause
  exit /b 1
)
node server.js
pause
