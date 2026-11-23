param(
    [string]$Image = "ghcr.io/wxgoo/jianti-exam-system:latest",
    [string]$RepoRoot = "",
    [string]$OutputDir = ""
)
$ErrorActionPreference = "Stop"
# Determine repo root: default is 2 levels up from this script (scripts/deploy/ → repo root)
if (-not $RepoRoot) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
}
if (-not $OutputDir) { $OutputDir = Join-Path (Split-Path -Parent $RepoRoot) ("jianti-backup-" + (Get-Date -Format 'yyyyMMdd')) }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Set-Location $RepoRoot
Write-Host ""
Write-Host "========================================"
Write-Host "  jianti-exam-system - Create offline backup"
Write-Host "========================================"
Write-Host ""

# Step 1: source zip
Write-Host "[1/3] Archiving source ..."
$srcZip = Join-Path $OutputDir "jianti-exam-system-src.zip"
if (Test-Path $srcZip) { Remove-Item $srcZip -Force }
git archive --format=zip --output=$srcZip HEAD
$srcSizeMB = [math]::Round((Get-Item $srcZip).Length / 1MB, 1)
Write-Host "  OK  $srcZip ($srcSizeMB MB)"

# Step 2: Docker image tar
Write-Host "[2/3] Pulling and saving Docker image ..."
$hasDocker = Get-Command docker -ErrorAction SilentlyContinue
$imageTar = $null
if (-not $hasDocker) {
    Write-Host "  SKIP docker not found on this machine."
    Write-Host "       Run this script on a machine with Docker Desktop/Engine installed."
    Write-Host "       Or manually: docker pull $Image ; docker save -o jianti-exam-system-image.tar $Image"
} else {
    docker pull $Image
    $imageTar = Join-Path $OutputDir "jianti-exam-system-image.tar"
    if (Test-Path $imageTar) { Remove-Item $imageTar -Force }
    docker save -o $imageTar $Image
    $imgSizeMB = [math]::Round((Get-Item $imageTar).Length / 1MB, 1)
    Write-Host "  OK  $imageTar ($imgSizeMB MB)"
}

# Step 3: readme + merge
Write-Host "[3/3] Writing offline README ..."
$date = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$readmeLines = @(
    "# jianti-exam-system - Offline Deployment Package",
    "",
    "Generated: $date",
    "",
    "## Contents",
    "",
    "| File | Description |",
    "|---|---|",
    "| jianti-exam-system-src.zip | Full source code (git archive HEAD) |"
)
if ($imageTar) {
    $readmeLines += "| jianti-exam-system-image.tar | Docker image from ghcr.io/wxgoo/jianti-exam-system:latest |"
}
$readmeLines += @(
    "",
    "## Offline Deploy Steps",
    "",
    "```powershell",
    "# 1. Load Docker image (if image tar included)",
    "docker load -i jianti-exam-system-image.tar",
    "",
    "# 2. Extract source",
    "Expand-Archive jianti-exam-system-src.zip jianti-exam-system",
    "",
    "# 3. Edit docker-compose.yml",
    "cd jianti-exam-system\deploy\nas",
    "# Edit APP_BASE_URL=http://<YOUR_IP>:3050",
    "# If no image tar - use 'ghcr.io/wxgoo/jianti-exam-system:latest' directly",
    "",
    "# 4. Start",
    "docker compose up -d",
    "```",
    "",
    "## Unrar / RAR extraction backend",
    "",
    "The Docker image already includes unrar, p7zip-full and rarfile.",
    "After container starts, the SourceFinder dialog status bar should be GREEN.",
    "No extra install needed inside container.",
    "",
    "## For Windows host (without Docker)",
    "",
    "Node.js >= 22.13.0 + 7-Zip or WinRAR (for RAR auto-import)",
    "deploy-windows.bat  => one-click build + background start",
    "scripts\deploy\install-windows-service.ps1  => install as NSSM service (auto-start on boot)",
    ""
)
$readmeLines -join "`r`n" | Out-File -FilePath (Join-Path $OutputDir "OFFLINE-README.md") -Encoding utf8

Write-Host ""
Write-Host "========================================"
Write-Host "  Backup directory ready:"
Write-Host "  $OutputDir"
Write-Host "========================================"
Get-ChildItem $OutputDir | ForEach-Object {
    $mb = if ($_.PSIsContainer) { "-" } else { [math]::Round($_.Length / 1MB, 1) }
    Write-Host "    $($_.Name)  ($mb MB)"
}
Write-Host ""
Write-Host "NOTE: Docker image tar not generated on this machine."
Write-Host "      Run this script on a machine with Docker to get the full offline package."
Write-Host "      Or manually: docker pull ghcr.io/wxgoo/jianti-exam-system:latest"
Write-Host "                   docker save -o jianti-exam-system-image.tar ghcr.io/wxgoo/jianti-exam-system:latest"