# AI Console 启动器
# 用法：双击 start.bat；只想本机用就 start.bat notunnel

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$skipTunnel = $args -contains 'notunnel'

Write-Host '==========================================' -ForegroundColor Cyan
Write-Host '  AI Console 启动' -ForegroundColor Cyan
Write-Host '==========================================' -ForegroundColor Cyan
Write-Host ''

# 1) 第一次或改过代码后没有 dist，就先构建
if (-not (Test-Path (Join-Path $here 'dist\index.html'))) {
  Write-Host '[1/3] 没有构建产物，正在构建前端（约 10 秒）...' -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) {
    Write-Host '构建失败，先看上面的报错。' -ForegroundColor Red
    Read-Host '按回车退出'
    exit 1
  }
}
else {
  Write-Host '[1/3] 已有构建产物，跳过构建（代码改动后想看效果请先 npm run build）'
}

# 2) 起服务：8787 已经有人监听就不重复开
$busy = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host '[2/3] 8787 已有服务在跑，跳过'
}
else {
  Write-Host '[2/3] 启动服务窗口（关掉那个黑窗口 = 停止服务）'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'node server/index.mjs' -WorkingDirectory $here
  # 等端口起来，最多 10 秒
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) { break }
  }
}

# 3) 内网穿透
if ($skipTunnel) {
  Write-Host '[3/3] 跳过内网穿透，本次只有本机能访问'
}
else {
  $cpolar = 'C:\Program Files\cpolar\cpolar.exe'
  if (Test-Path $cpolar) {
    Write-Host '[3/3] 启动隧道窗口（公网地址看那行 Forwarding）'
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', "`"$cpolar`" http 8787" -WorkingDirectory $here
    Start-Sleep -Seconds 3
  }
  else {
    Write-Host '[3/3] 没找到 cpolar，跳过隧道' -ForegroundColor Yellow
  }
}

Start-Process 'http://localhost:8787'

Write-Host ''
Write-Host '已启动：' -ForegroundColor Green
Write-Host '  本机   http://localhost:8787'
if (-not $skipTunnel) { Write-Host '  公网   看「隧道」窗口里的 https://...cpolar.top 那一行' }
Write-Host ''
Write-Host '关掉对应的黑窗口就是停止服务。' -ForegroundColor DarkGray
Write-Host '只想本机用：在命令行执行 start.bat notunnel' -ForegroundColor DarkGray
Write-Host ''
Read-Host '按回车关闭这个窗口（不影响服务）'
