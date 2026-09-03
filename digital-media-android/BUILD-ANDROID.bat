@echo off
chcp 65001 >nul
title بناء تطبيق الإعلام الرقمي
rem ===========================================================
rem  يعمل من موضعه أياً كان مكان تشغيله: %~dp0 هو مجلد هذا الملف
rem  نفسه، فلا يهمّ من أين نُقر عليه ولا كيف فُكّ الأرشيف. هذا يمنع
rem  الخطأ الشائع: تشغيل npm من المجلد الخارجي فيصعد إلى الأعلى
rem  ويقرأ package.json آخر، فتختفي السكربتات بلا سبب ظاهر.
rem ===========================================================
cd /d "%~dp0"

echo.
echo   الإعلام الرقمي — تجهيز مشروع أندرويد
echo   ------------------------------------
echo   المجلد: %CD%
echo.

if not exist "package.json" (
  echo   [خطأ] لا يوجد package.json في هذا المجلد.
  echo   ضع هذا الملف داخل مجلد المشروع بجانب capacitor.config.json.
  echo.
  pause & exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo   [خطأ] Node.js غير مثبَّت أو غير مضاف إلى PATH.
  echo   نزّله من https://nodejs.org ثم أعد تشغيل هذه النافذة.
  echo.
  pause & exit /b 1
)

echo   [1/3] تثبيت الاعتماديات...
call npm install || (echo. & echo   [خطأ] فشل التثبيت. & pause & exit /b 1)

echo.
echo   [2/3] مزامنة طبقة الويب...
call npm run sync || (echo. & echo   [خطأ] فشلت المزامنة. & pause & exit /b 1)

echo.
echo   [3/3] فتح المشروع في Android Studio...
call npm run open

echo.
echo   تمّ. من Android Studio:  Build ^< Build Bundle(s) / APK(s) ^< Build APK(s)
echo   يخرج الملف في: android\app\build\outputs\apk\debug\app-debug.apk
echo.
pause
