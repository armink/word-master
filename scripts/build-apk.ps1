# ============================================================
# word-master APK 构建（远程壳 APK：WebView 直接加载线上站点）
#
# 站点地址来源（按优先级）：
#   1. -AppUrl 参数
#   2. 环境变量 APP_URL
#   3. 仓库根目录的 .apk-url 文件（已在 .gitignore 中，不会提交）
#
# 用法：
#   .\scripts\build-apk.ps1                                  # 读取 .apk-url / APP_URL
#   .\scripts\build-apk.ps1 -AppUrl https://example.com      # 临时指定站点
#   .\scripts\build-apk.ps1 -JavaHome D:\jdk-21 -AndroidHome E:\Android\SDK
#
# 前置条件：
#   - JDK 21（或通过 -JavaHome / JAVA_HOME 指定）
#   - Android SDK 已安装 platforms;android-36 与 build-tools;36.0.0
#
# 产物：apk-downloads/word-master-<时间戳>-debug.apk
# ============================================================
param(
    [string]$AppUrl = $env:APP_URL,
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$AndroidHome = $env:ANDROID_HOME
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$FrontendDir = Join-Path $RootDir "frontend"
$AndroidDir = Join-Path $FrontendDir "android"
$ConfigFile = Join-Path $FrontendDir "capacitor.config.json"
$OutputDir = Join-Path $RootDir "apk-downloads"
$UrlFile = Join-Path $RootDir ".apk-url"

if (-not $AppUrl -and (Test-Path $UrlFile)) {
    $AppUrl = (Get-Content $UrlFile -Raw).Trim()
}
if (-not $AppUrl) {
    throw "未指定站点地址：请用 -AppUrl 参数、APP_URL 环境变量，或在仓库根目录创建 .apk-url 文件（已加入 .gitignore）"
}

if (-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome "bin\java.exe"))) {
    throw "未找到 JDK 21，请通过 -JavaHome 或 JAVA_HOME 指定"
}
if (-not $AndroidHome -or -not (Test-Path (Join-Path $AndroidHome "platforms\android-36"))) {
    throw "未找到 Android SDK（缺少 platforms;android-36），请通过 -AndroidHome 或 ANDROID_HOME 指定"
}

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$env:ANDROID_SDK_ROOT = $AndroidHome
$env:PATH = "$JavaHome\bin;$env:PATH"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " word-master APK Build" -ForegroundColor Cyan
Write-Host " App URL : $AppUrl" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: SDK 路径 + 占位 web 资源（远程壳不需要真实前端产物）
Write-Host "[1/4] 准备 SDK 配置与占位资源..." -ForegroundColor Yellow
Set-Content -Path (Join-Path $AndroidDir "local.properties") -Value ("sdk.dir=" + $AndroidHome.Replace('\', '\\')) -NoNewline
$DistDir = Join-Path $FrontendDir "dist"
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
Set-Content -Path (Join-Path $DistDir "index.html") -Value '<!doctype html><html><body></body></html>' -NoNewline

# Step 2: 临时注入站点地址并同步到 Android 工程
Write-Host "[2/4] 注入站点地址并执行 cap sync..." -ForegroundColor Yellow
$ConfigBackup = [System.IO.File]::ReadAllBytes($ConfigFile)
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
try {
    $ConfigJson = [System.IO.File]::ReadAllText($ConfigFile) | ConvertFrom-Json
    $ConfigJson.server | Add-Member -NotePropertyName url -NotePropertyValue $AppUrl -Force
    [System.IO.File]::WriteAllText($ConfigFile, ($ConfigJson | ConvertTo-Json -Depth 10), $Utf8NoBom)
    Push-Location $FrontendDir
    try {
        npx --no-install cap sync
        if ($LASTEXITCODE -ne 0) { throw "cap sync 失败（exit $LASTEXITCODE）" }
    } finally {
        Pop-Location
    }
} finally {
    [System.IO.File]::WriteAllBytes($ConfigFile, $ConfigBackup)
}

# Step 3: 构建 APK
Write-Host "[3/4] 构建 Debug APK..." -ForegroundColor Yellow
Push-Location $AndroidDir
try {
    .\gradlew.bat --no-daemon assembleDebug
    if ($LASTEXITCODE -ne 0) { throw "gradle 构建失败（exit $LASTEXITCODE）" }
} finally {
    Pop-Location
}

# Step 4: 归档产物
Write-Host "[4/4] 归档 APK..." -ForegroundColor Yellow
$Apk = Join-Path $AndroidDir "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $Apk)) { throw "未找到构建产物：$Apk" }
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$Target = Join-Path $OutputDir ("word-master-" + (Get-Date -Format "yyyyMMdd-HHmm") + "-debug.apk")
Copy-Item $Apk $Target -Force
$sizeMB = [math]::Round((Get-Item $Target).Length / 1MB, 2)
Write-Host "  [OK] $Target ($sizeMB MB)" -ForegroundColor Green
