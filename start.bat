@echo off
REM ============================================================
REM  FB Intel — one-click launcher (Windows)
REM  Stops any old server on ports 3000/4000, installs deps,
REM  seeds the database on first run, then starts backend + web.
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo ==== FB Intel launcher ====
echo.

REM --- 1) Stop anything already listening on 4000 (API) and 3000 (web) ---
echo Stopping old servers on ports 4000 and 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

REM --- 2) Backend: install deps + env + seed on first run ---
if not exist "server\node_modules" (
  echo Installing backend dependencies...
  pushd server && call npm install && popd
)
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul
if not exist "server\data\fbintel.db" (
  echo Seeding local database...
  pushd server && call npm run seed && popd
)

REM --- 3) Frontend: install deps + env ---
if not exist "web\node_modules" (
  echo Installing frontend dependencies...
  pushd web && call npm install && popd
)
if not exist "web\.env" copy "web\.env.example" "web\.env" >nul

REM --- 4) Launch both in their own windows ---
echo Starting backend on http://localhost:4000 ...
start "FB Intel - Server" cmd /k "cd /d %~dp0server && npm run dev"

echo Starting frontend on http://localhost:3000 ...
start "FB Intel - Web" cmd /k "cd /d %~dp0web && npm run dev"

echo.
echo Opening http://localhost:3000 in your browser (give it ~10 seconds)...
timeout /t 10 >nul
start "" http://localhost:3000

echo.
echo Done. Two windows opened (Server + Web). Close them to stop the app.
echo Login: admin@fbintel.local  /  Admin123!
endlocal
