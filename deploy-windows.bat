@echo off
rem ================================================================
rem jianti-exam-system - one-click deployment (Windows)
rem Details in USER_MANUAL section 11.1
rem
rem Usage: double-click or run deploy-windows.bat
rem   - check Node version (>= 22.13.0)
rem   - npm install / npm run build
rem   - start full stack in background (Web http://127.0.0.1:3050 / API http://127.0.0.1:3051)
rem   - poll http://127.0.0.1:3050/api/ready until ready, print URLs
rem ================================================================
setlocal

cd /d "%~dp0"
echo.
echo ========================================
echo   jianti-exam-system one-click deploy
echo ========================================
echo.

node scripts/deploy/deploy-windows.mjs
if errorlevel 1 (
    echo [ERROR] deployment failed, see messages above.
    pause
    exit /b 1
)
