# 一键启动本地大富翁服务并打开浏览器
# 用法：双击 启动游戏.bat，或 powershell -File scripts\launch.ps1
param(
  [switch]$NoBrowser,
  [int]$Port = 3210
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Test-Port([int]$p) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', $p)
    $c.Close()
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Port $Port)) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) {
    $fallback = 'C:\Users\mechrevo\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path $fallback) { $node = $fallback }
  }
  if (-not $node -or -not (Test-Path $node)) {
    Write-Host '找不到 Node.js，请先安装 Node 18 或更新版本。' -ForegroundColor Red
    Read-Host '按回车退出'
    exit 1
  }
  Start-Process -FilePath $node -ArgumentList 'server.mjs' -WorkingDirectory $root -WindowStyle Minimized
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 300
    if (Test-Port $Port) { break }
  }
}

if (-not (Test-Port $Port)) {
  Write-Host "服务器没能启动，端口 $Port 不可用。" -ForegroundColor Red
  Read-Host '按回车退出'
  exit 1
}

if (-not $NoBrowser) {
  Start-Process "http://localhost:$Port"
}
Write-Host "游戏已就绪：http://localhost:$Port"
