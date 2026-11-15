$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$cf = Join-Path $root 'bin\cloudflared.exe'
if (!(Test-Path $cf)) {
  Write-Host '缺少 bin\cloudflared.exe，请重新运行安装。' -ForegroundColor Red
  Read-Host '按回车退出'
  exit 1
}

$node = 'C:\Program Files\nodejs\node.exe'
if (!(Test-Path $node)) { $node = 'node' }

function Test-Server {
  try { Invoke-RestMethod 'http://127.0.0.1:3210/api/health' -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

$startedServer = $false
if (-not (Test-Server)) {
  Write-Host '正在启动游戏服务…' -ForegroundColor Cyan
  Start-Process -FilePath $node -ArgumentList 'server.mjs' -WorkingDirectory $root -WindowStyle Hidden
  $startedServer = $true
  for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 500; if (Test-Server) { break } }
}
if (-not (Test-Server)) {
  Write-Host '游戏服务启动失败：3210 端口没有响应。' -ForegroundColor Red
  Read-Host '按回车退出'
  exit 1
}

Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$log = Join-Path $env:TEMP 'dmj-cloudflared.log'
Remove-Item $log, "$log.out" -Force -ErrorAction SilentlyContinue

Write-Host '正在建立公网隧道（首次可能需要 5–15 秒）…' -ForegroundColor Cyan
$p = Start-Process -FilePath $cf -ArgumentList 'tunnel', '--url', 'http://localhost:3210', '--no-autoupdate' -RedirectStandardError $log -RedirectStandardOutput "$log.out" -PassThru -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 80; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value; break }
  }
  if ($p.HasExited) { break }
}
if (-not $url) {
  Write-Host '隧道建立失败，最后几行日志：' -ForegroundColor Red
  if (Test-Path $log) { Get-Content $log -Tail 20 }
  Read-Host '按回车退出'
  exit 1
}

try { Set-Clipboard -Value $url } catch { }

Clear-Host
Write-Host '================================================' -ForegroundColor Green
Write-Host '  联机已开启！公网地址（已复制到剪贴板）' -ForegroundColor Green
Write-Host ''
Write-Host "  $url" -ForegroundColor Yellow
Write-Host ''
Write-Host '  把地址发给朋友，浏览器打开就能玩' -ForegroundColor Green
Write-Host '================================================' -ForegroundColor Green
Write-Host ''
Write-Host '提示：' -ForegroundColor DarkYellow
Write-Host '  · 这个窗口不能关，关掉联机就断了'
Write-Host '  · 电脑睡眠/断网也会断线'
Write-Host '  · 重新打开会生成新地址，旧链接会失效'
Write-Host ''
Write-Host '按 Ctrl+C 结束联机。'
Write-Host ''

try { Wait-Process -Id $p.Id } catch { }
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
if ($startedServer) {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\.mjs' } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}
