@echo off
rem ================================================================
rem jianti-exam-system - one-click deployment (Windows)
rem   - checks Node version
rem   - auto npm ci + npm run build (if needed)
rem   - kills any previous instance
rem   - starts full stack in background
rem   - polls /api/ready
rem All text here is ASCII-only to avoid codepage 936 corruption.
rem ================================================================
setlocal enabledelayedexpansion

cd /d "%~dp0"
echo.
echo ========================================
echo   jianti-exam-system one-click deploy
echo ========================================
echo.

rem ---- 1. check Node ----
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] node.exe not found. Install from https://nodejs.org/
    goto :endfail
)
for /f "delims=" %%V in ('node -v 2^>nul') do set "NODE_VER=%%V"
echo [INFO] Node.js: %NODE_VER%

rem ---- 2. kill any previous instance ----
echo [INFO] Cleaning up previous instance ...
if exist ".runtime\local-3050.json" (
    node scripts/stop-local.mjs 2>nul
    timeout /t 2 /nobreak >nul
)
for %%P in (3050 3051) do (
    for /f "tokens=5" %%T in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":%%P"') do (
        taskkill /PID %%T /F 2>nul
    )
)
timeout /t 2 /nobreak >nul
echo [INFO] Cleanup done.

rem ---- 3. npm ci if needed ----
if not exist "node_modules" (
    echo [INFO] node_modules missing, running npm ci ...
    call npm.cmd ci --omit=dev
    if errorlevel 1 goto :endfail
)

rem ---- 4. build if needed ----
if not exist ".next\BUILD_ID" (
    echo [INFO] .next missing, running npm run build ...
    call npm.cmd run build
    if errorlevel 1 goto :endfail
)

rem ---- 5. launch (background) ----
echo.
echo ========================================
echo   Starting ...  (Web http://127.0.0.1:3050)
echo ========================================
echo.

node scripts/deploy/deploy-windows.mjs
if errorlevel 1 goto :endfail

echo.
echo ========================================
echo   DONE - service is running in background
echo   You may close this window
echo ========================================
echo.
pause
exit /b 0

:endfail
echo.
echo ========================================
echo   FAILED - see messages above
echo ========================================
echo.
pause
exit /b 1
