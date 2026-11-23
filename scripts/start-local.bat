@echo off
rem ================================================================
rem jianti-exam-system - front-local launch (Windows)
rem   - kills previous instance first (PID file + port scan)
rem   - auto npm ci / npm run build if needed
rem   - foreground: keep this window open to keep service alive
rem All text is ASCII to avoid codepage 936 issues.
rem ================================================================

setlocal enabledelayedexpansion

echo.
echo ========================================
echo   jianti-exam-system launcher (foreground)
echo ========================================
echo.

rem ---- 1. cd to repo root ----
cd /d "%~dp0.."
echo [INFO] Working dir: %CD%

rem ---- 2. check Node ----
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] node.exe not found. Install from https://nodejs.org/
    goto :fail
)
for /f "delims=" %%V in ('node -v 2^>nul') do set "NODE_VER=%%V"
echo [INFO] Node.js: %NODE_VER%

rem ---- 3. kill old instance ----
echo [INFO] Cleaning previous instance ...
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

rem ---- 4. npm ci if needed ----
if not exist "node_modules" (
    echo [INFO] node_modules missing, npm ci ...
    call npm.cmd ci --omit=dev
    if errorlevel 1 goto :fail
)

rem ---- 5. build if needed ----
if not exist ".next\BUILD_ID" (
    echo [INFO] .next missing, npm run build ...
    call npm.cmd run build
    if errorlevel 1 goto :fail
    echo [INFO] Build done.
)

rem ---- 6. load .env ----
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        echo.%%a | findstr /i "^#" >nul && goto :envnext
        echo.%%a | findstr /r "^[[:space:]]*$" >nul && goto :envnext
        set "%%a=%%b"
    )
    :envnext
)

rem ---- 7. start (foreground) ----
echo.
echo ========================================
echo   Starting ... KEEP THIS WINDOW OPEN
echo   Close this window = stop service
echo   Web: http://127.0.0.1:3050
echo   API: http://127.0.0.1:3051
echo ========================================
echo.

node scripts/run-local.mjs
set "EXITCODE=%ERRORLEVEL%"

echo.
echo ========================================
echo   Service exited (code = %EXITCODE%)
echo ========================================
echo.
pause
exit /b %EXITCODE%

:fail
echo.
echo ========================================
echo   FAILED - see messages above
echo ========================================
echo.
pause
exit /b 1
