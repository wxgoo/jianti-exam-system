#!/usr/bin/env pwsh
# ================================================================================
# jianti-exam-system —— NSSM 安装脚本（Windows 开机自启）
#
# 用法（管理员 PowerShell）：
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\scripts\deploy\install-windows-service.ps1
#
# 做的事：
#   1. 检查 nssm.exe（已装则跳过，未装则用 winget / 手动下载）
#   2. 检查 Node.js >= 22.13.0
#   3. 如果还没 build 则 npm ci + npm run build
#   4. nssm install 创建服务：Node 跑 scripts\run-local.mjs
#   5. 设置服务自动启动 + 故障自动重启
#   6. 启动服务 + 轮询 /api/ready
#
# 卸载：
#   .\scripts\deploy\uninstall-windows-service.ps1
# ================================================================================
param(
    [string]$ServiceName = "jianti-exam",
    [string]$NssmExe = "",   # 手动指定 nssm 路径，不指定则自动探测
    [int]$WebPort = 3050,
    [int]$ApiPort = 3051,
    [string]$BaseUrl = "",
    [switch]$SkipBuild       # 跳过 npm build（已经构建过时用）
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host ""
Write-Host "========================================"
Write-Host "  jianti-exam-system · 安装 Windows 服务"
Write-Host "========================================"
Write-Host ""

# ---------- 1. 找 nssm ----------
function Find-Nssm {
    param([string]$Preferred)
    if ($Preferred -and (Test-Path $Preferred)) { return $Preferred }
    $candidates = @(
        $env:NSSM_HOME ? (Join-Path $env:NSSM_HOME "win64\nssm.exe") : "",
        "$env:ProgramFiles\nssm\win64\nssm.exe",
        "$env:ProgramFiles (x86)\nssm\win64\nssm.exe",
        "$env:USERPROFILE\scoop\apps\nssm\current\win64\nssm.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\*nssm*\nssm.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }
    if ($candidates.Count -gt 0) { return $candidates[0] }
    return $null
}

$nssm = Find-Nssm -Preferred $NssmExe
if (-not $nssm) {
    Write-Host "[INFO] nssm.exe 未找到，尝试 winget install nssm ..." -ForegroundColor Cyan
    try { winget install -e --id=kirillkovalenko.nssm --accept-package-agreements --accept-source-agreements }
    catch {
        Write-Host "[WARN] winget 装失败。请手动：" -ForegroundColor Yellow
        Write-Host "       1. 浏览器打开 https://nssm.cc/download"
        Write-Host "       2. 解压后把 win64\nssm.exe 放到任意 PATH 目录"
        Write-Host "       3. 再运行本脚本，或用 -NssmExe 参数指定路径"
        exit 1
    }
    Start-Sleep -Seconds 2
    $nssm = Find-Nssm -Preferred $NssmExe
}
if (-not $nssm) { Write-Host "[ERROR] nssm 仍未找到。" -ForegroundColor Red; exit 1 }
Write-Host "[OK] nssm: $nssm" -ForegroundColor Green

# ---------- 2. 检查 Node ----------
$nodeVersion = (& node -v).Trim()
$nodeOk = $nodeVersion -match "^v(22\.(1[3-9]|[2-9]\d)|2[3-9]|[3-9]\d)"
Write-Host "[INFO] Node.js: $nodeVersion"
if (-not $nodeOk) { Write-Host "[ERROR] Node 版本过低，要求 >= 22.13.0" -ForegroundColor Red; exit 1 }
Write-Host "[OK] Node 版本 OK" -ForegroundColor Green

# ---------- 3. 可选装解压后端 ----------
$hasUnrar = Get-Command unrar -ErrorAction SilentlyContinue
$has7z = Get-Command 7z -ErrorAction SilentlyContinue
if (-not $hasUnrar -and -not $has7z) {
    Write-Host "[WARN] 未检测到 unrar/7z，第一试卷网「自动入库」按钮会禁用。" -ForegroundColor Yellow
    Write-Host "       建议: winget install -e --id=7zip.7zip"
}

# ---------- 4. build ----------
if (-not $SkipBuild) {
    if (-not (Test-Path (Join-Path $Root "node_modules"))) {
        Write-Host "[INFO] 未找到 node_modules，先 npm ci ..."
        & npm.cmd ci --omit=dev
    }
    if (-not (Test-Path (Join-Path $Root ".next\BUILD_ID"))) {
        Write-Host "[INFO] .next 不存在，执行 npm run build ..."
        & npm.cmd run build
    }
}

# ---------- 5. 安装服务 ----------
$nodeExe = (Get-Command node).Source
Write-Host "[INFO] 安装服务: $ServiceName"
Write-Host "       Application: $nodeExe"
Write-Host "       Arguments:   scripts\run-local.mjs"
Write-Host "       Directory:   $Root"
Write-Host "       Web:  http://127.0.0.1:$WebPort"
Write-Host "       API:  http://127.0.0.1:$ApiPort"

# 如果服务已存在，先 stop + remove
$existing = & $nssm status $ServiceName 2>&1 | Out-String
if ($LASTEXITCODE -eq 0 -or $existing -match "SERVICE_NAME") {
    Write-Host "[INFO] 服务已存在，先卸载旧版 ..." -ForegroundColor Cyan
    & $nssm stop $ServiceName *>$null
    Start-Sleep -Seconds 1
    & $nssm remove $ServiceName confirm
}

& $nssm install $ServiceName $nodeExe "scripts\run-local.mjs"
& $nssm set     $ServiceName AppDirectory              $Root
& $nssm set     $ServiceName AppParameters             "scripts\run-local.mjs"
& $nssm set     $ServiceName Start                     SERVICE_AUTO_START
& $nssm set     $ServiceName Description                "jianti-exam-system - 智能组卷系统"
& $nssm set     $ServiceName DisplayName               "Jianti Exam System"
& $nssm set     $ServiceName AppStdout                 (Join-Path $Root ".runtime\logs\service.out.log")
& $nssm set     $ServiceName AppStderr                 (Join-Path $Root ".runtime\logs\service.err.log")
& $nssm set     $ServiceName AppRotateFiles            1
& $nssm set     $ServiceName AppRotateBytes            10485760    # 10 MB
& $nssm set     $ServiceName AppRotateSeconds          86400
& $nssm set     $ServiceName AppRestartDelay           5000
& $nssm set     $ServiceName AppExit                    Default     SERVICE_RESTART
& $nssm set     $ServiceName AppExit                    1           SERVICE_RESTART
& $nssm set     $ServiceName AppExit                    2           SERVICE_RESTART

# 环境变量
$envFile = @(
    "JIANTI_WEB_PORT=$WebPort",
    "JIANTI_API_PORT=$ApiPort",
    "JIANTI_PROCESS_ROLE=supervisor",
    "APP_BASE_URL=" + ($(if ($BaseUrl) { $BaseUrl } else { "http://127.0.0.1:$WebPort" }))
) -join "`n"
& $nssm set $ServiceName AppEnvironmentExtra $envFile

Write-Host "[OK] 服务已注册" -ForegroundColor Green

# ---------- 6. 启动 + 就绪检查 ----------
Write-Host "[INFO] 启动服务 ..."
& $nssm start $ServiceName
Start-Sleep -Seconds 3

$deadline = (Get-Date).AddSeconds(60)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort/api/ready" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 2
}

Write-Host ""
if ($ready) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  部署完成 — 服务已就绪" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Web:     http://127.0.0.1:$WebPort"
    Write-Host "  API:     http://127.0.0.1:$ApiPort"
    Write-Host "  健康:    http://127.0.0.1:$WebPort/api/ready"
    Write-Host "  日志:    .runtime\logs\service.out.log / .err.log"
    Write-Host ""
    Write-Host "  sc query $ServiceName          # 查状态"
    Write-Host "  nssm restart $ServiceName      # 重启"
    Write-Host "  .\scripts\deploy\uninstall-windows-service.ps1  # 卸载"
} else {
    Write-Host "[WARN] 服务未能在 60 秒内就绪，请看日志 .runtime\logs\service.err.log" -ForegroundColor Yellow
    Write-Host "       手动启动: nssm restart $ServiceName"
}
Write-Host ""
