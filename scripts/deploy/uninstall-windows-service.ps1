#!/usr/bin/env pwsh
# 卸载 Windows 服务
param([string]$ServiceName = "jianti-exam")
$ErrorActionPreference = "Stop"

Write-Host "[INFO] 停止服务 $ServiceName ..." -ForegroundColor Cyan
Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "[INFO] 移除服务 $ServiceName ..." -ForegroundColor Cyan
sc.exe delete $ServiceName | Out-Null

Write-Host "[OK] 服务已卸载" -ForegroundColor Green
