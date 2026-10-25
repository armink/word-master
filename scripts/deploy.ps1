# ============================================================
# word-master deploy to hern-gateway server
#
# 服务器地址与线上域名不写入仓库，从仓库根目录的 .deploy-env 读取
# （该文件已加入 .gitignore）：
#   DEPLOY_SERVER=your.server.ip
#   DEPLOY_DOMAIN=https://your-domain.com
#
# Usage:
#   .\scripts\deploy.ps1                       # lite build (no local semantic model)
#   .\scripts\deploy.ps1 -InstallSemantic true # full build (semantic model included)
#   .\scripts\deploy.ps1 -SkipBuild            # upload existing word-master:latest
#   .\scripts\deploy.ps1 -Server 1.2.3.4 -Domain https://example.com   # override
#
# Prereqs:
#   - Docker Desktop running (Linux containers, amd64)
#   - SSH key configured for root@<server>
# ============================================================
param(
    [string]$Server = "",
    [string]$Domain = "",
    [string]$ProjectPath = "/opt/word-master",
    [switch]$SkipBuild,
    [string]$InstallSemantic = "false"
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ImageZip = Join-Path $RootDir "word-master-images.zip"
$DeployEnvFile = Join-Path $RootDir ".deploy-env"

if (Test-Path $DeployEnvFile) {
    foreach ($line in Get-Content $DeployEnvFile) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            $key = $Matches[1]
            $value = $Matches[2]
            if ($key -eq 'DEPLOY_SERVER' -and -not $Server) { $Server = $value }
            if ($key -eq 'DEPLOY_DOMAIN' -and -not $Domain) { $Domain = $value }
        }
    }
}
if (-not $Server) { throw "未指定服务器地址：请用 -Server 传入，或在 .deploy-env 中设置 DEPLOY_SERVER" }
if (-not $Domain) { throw "未指定线上域名：请用 -Domain 传入，或在 .deploy-env 中设置 DEPLOY_DOMAIN" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " word-master Deploy" -ForegroundColor Cyan
Write-Host " Target : root@$Server : $ProjectPath" -ForegroundColor Cyan
Write-Host " Semantic model installed: $InstallSemantic" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 0: preflight
docker info --format "{{.ServerVersion}}" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Docker daemon is not running. Start Docker Desktop first."
}

# Step 1: build
if (-not $SkipBuild) {
    Write-Host "[1/5] Building image..." -ForegroundColor Yellow
    Push-Location $RootDir
    try {
        docker build --platform linux/amd64 --build-arg INSTALL_SEMANTIC=$InstallSemantic -t word-master:latest .
        if ($LASTEXITCODE -ne 0) { throw "docker build failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
    Write-Host "  [OK] Build completed" -ForegroundColor Green
} else {
    Write-Host "[1/5] Skip build (using local word-master:latest)" -ForegroundColor Gray
}

# Step 2: save and compress
Write-Host "[2/5] Saving image..." -ForegroundColor Yellow
$tarFile = Join-Path $RootDir "word-master-images.tar"
docker save -o $tarFile word-master:latest
if ($LASTEXITCODE -ne 0) { throw "docker save failed" }
if (Test-Path $ImageZip) { Remove-Item $ImageZip -Force }
Compress-Archive -Path $tarFile -DestinationPath $ImageZip -CompressionLevel Optimal
Remove-Item $tarFile -Force
$sizeMB = [math]::Round((Get-Item $ImageZip).Length / 1MB, 1)
Write-Host "  [OK] Package: $sizeMB MB" -ForegroundColor Green

# Step 3: upload
Write-Host "[3/5] Uploading..." -ForegroundColor Yellow
ssh root@$Server "mkdir -p $ProjectPath"
if ($LASTEXITCODE -ne 0) { throw "ssh mkdir failed" }
scp $ImageZip root@${Server}:/tmp/word-master-images.zip
if ($LASTEXITCODE -ne 0) { throw "scp image failed" }
scp (Join-Path $RootDir "docker-compose.server.yml") root@${Server}:${ProjectPath}/docker-compose.yml
if ($LASTEXITCODE -ne 0) { throw "scp compose failed" }

# 生成上传用 .env：把线上域名写入 PROD_CORS_ORIGIN，
# 由 compose 注入为 CORS_ORIGIN（本地开发用的 CORS_ORIGIN 不会带到生产）
$envFile = Join-Path $RootDir "backend\.env"
$tmpEnv = Join-Path $env:TEMP "word-master-deploy.env"
if (Test-Path $envFile) {
    $envLines = @(Get-Content $envFile | Where-Object { $_ -notmatch '^\s*PROD_CORS_ORIGIN\s*=' })
} else {
    Write-Host "  [WARN] backend\.env not found; 服务器 .env 仅写入 PROD_CORS_ORIGIN，其余变量需手动补齐" -ForegroundColor Yellow
    $envLines = @()
}
$envLines += "PROD_CORS_ORIGIN=$Domain"
[System.IO.File]::WriteAllLines($tmpEnv, $envLines, (New-Object System.Text.UTF8Encoding($false)))

scp $tmpEnv root@${Server}:${ProjectPath}/.env
if ($LASTEXITCODE -ne 0) { throw "scp .env failed" }
Remove-Item $tmpEnv -Force -ErrorAction SilentlyContinue
ssh root@$Server "chmod 600 $ProjectPath/.env"
if ($LASTEXITCODE -ne 0) { throw "chmod .env failed" }
Write-Host "  [OK] .env uploaded (PROD_CORS_ORIGIN=$Domain)" -ForegroundColor Green
Write-Host "  [OK] Upload completed" -ForegroundColor Green

# Step 4: load and restart
Write-Host "[4/5] Loading image and restarting service..." -ForegroundColor Yellow
$remoteCmd = 'set -e; cd /tmp; unzip -o word-master-images.zip >/dev/null; docker load -i word-master-images.tar >/dev/null; rm -f word-master-images.tar word-master-images.zip; cd ' + $ProjectPath + '; docker compose up -d --remove-orphans; echo "--- waiting for health ---"; i=0; while [ $i -lt 12 ]; do s=$(docker inspect --format "{{.State.Health.Status}}" word-master 2>/dev/null || echo unknown); echo "health: $s"; [ "$s" = "healthy" ] && break; i=$((i+1)); sleep 5; done; docker compose ps'
ssh root@$Server $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "remote deploy failed" }
Write-Host "  [OK] Service updated" -ForegroundColor Green

# Step 5: cleanup
Write-Host "[5/5] Cleaning up..." -ForegroundColor Yellow
Remove-Item $ImageZip -Force -ErrorAction SilentlyContinue
Write-Host "  [OK] Done" -ForegroundColor Green

Write-Host ""
Write-Host "Next steps (首次部署时):" -ForegroundColor Cyan
Write-Host "  1. DNS: add A record for your domain -> $Server"
Write-Host "  2. Gateway: add server blocks in hern-gateway/nginx.conf, redeploy gateway"
Write-Host "  3. Certificate: bash /opt/hern-gateway/setup-https.sh <email>"
Write-Host "  4. Verify: $Domain/api/health"
