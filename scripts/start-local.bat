@echo off
rem ================================================================
rem jianti-exam-system 一键启动脚本（Windows）
rem - 设置环境变量（不污染系统，仅当前窗口生效）
rem - 激活 Python venv 虚拟环境（如存在）
rem - 启动 Node.js 全栈服务（Web 3050 / API 3051）
rem ================================================================

setlocal enabledelayedexpansion

echo.
echo ========================================
echo   jianti-exam-system 启动脚本
echo ========================================
echo.

rem ---- 1. 切换到脚本所在目录的上一级（项目根目录）-----
cd /d "%~dp0.."
echo [INFO] 工作目录: %CD%

rem ---- 2. 检查 Node.js 是否可用 ----
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] 未找到 node.exe，请先安装 Node.js (https://nodejs.org/)
    pause
    exit /b 1
)
for /f "delims=" %%V in ('node -v 2^>nul') do set "NODE_VER=%%V"
echo [INFO] Node.js 版本: %NODE_VER%

rem ---- 3. 加载 .env 环境变量（仅当前窗口，不写入系统）-----
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        echo.%%a | findstr /i "^#" >nul && goto :nextline
        echo.%%a | findstr /r "^[[:space:]]*$" >nul && goto :nextline
        set "%%a=%%b"
    )
    :nextline
)
echo [env] 已加载 .env 环境变量（当前窗口有效）

rem ---- 4. 激活 Python venv（若存在，避免污染系统 Python）-----
if exist ".venv\Scripts\activate.bat" (
    call ".venv\Scripts\activate.bat"
    echo [venv] 已激活 Python 虚拟环境: .venv
) else (
    echo [venv] 未找到 .venv，将使用系统 Python（如需隔离请先运行 build.py 创建）
)

rem ---- 5. 启动全栈服务 ----
echo.
echo [start] 启动 jianti-exam-system (Web http://localhost:3050 / API http://127.0.0.1:3051)
echo [INFO] 请保持此窗口打开，关闭窗口即可停止服务。
echo.

node scripts/run-local.mjs
if errorlevel 1 (
    echo.
    echo [ERROR] 服务启动失败，请查看上面的错误信息。
    pause
    exit /b 1
)

echo.
echo [INFO] 服务已停止。
pause
exit /b 0
