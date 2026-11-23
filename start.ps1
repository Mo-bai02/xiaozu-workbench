# 小组工作台 · 本地启动
# 双击 start.bat 即可；start.bat key 重新打开配置文件；start.bat notunnel 不开内网穿透

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$openKey = $args -contains 'key'
$skipTunnel = $args -contains 'notunnel'
$envPath = Join-Path $here '.env'

function Line($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Pause() { Read-Host '按回车退出' }

Write-Host ''
Line '  小组工作台' 'Cyan'
Line '  ----------------------------------------' 'DarkGray'
Write-Host ''

# 0. Node 版本
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Line '找不到 Node.js。' 'Red'
  Line '先安装 Node 22 或更高版本：https://nodejs.org/zh-cn'
  Pause
  exit 1
}
$version = (& node -v).TrimStart('v')
$major = [int]($version.Split('.')[0])
if ($major -lt 22) {
  Line "Node 版本太低（当前 $version），需要 22 或更高。" 'Red'
  Line '下载地址：https://nodejs.org/zh-cn'
  Pause
  exit 1
}

# 1. 依赖
if (Test-Path (Join-Path $here 'node_modules')) {
  Line '[1/5] 依赖已安装'
}
else {
  Line '[1/5] 第一次运行，安装依赖（约 1 分钟，需要联网）' 'Yellow'
  if (Test-Path (Join-Path $here 'package-lock.json')) { npm ci } else { npm install }
  if ($LASTEXITCODE -ne 0) {
    Line '依赖安装失败。网络慢可以换镜像：npm config set registry https://registry.npmmirror.com' 'Red'
    Pause
    exit 1
  }
}

# 2. 配置文件
if (-not (Test-Path $envPath)) {
  $header = @"
# ============================================================
#  小组工作台 · 配置
#
#  想要 AI 真正回答：在下面任意一行等号后面填上你的 Key
#  不填也能用：AI 走「模拟」模式，返回预设内容，其他功能不受影响
#  填完保存并关闭记事本，脚本会继续启动
#  以后想改：双击 start.bat key
#
#  申请地址（挑一个就行）：
#    DeepSeek    https://platform.deepseek.com/api_keys        便宜，国内直连
#    硅基流动     https://cloud.siliconflow.cn/account/ak        有免费模型
#    智谱        https://open.bigmodel.cn/usercenter/apikeys    glm-4-flash 免费
#    阿里云百炼   https://bailian.console.aliyun.com            新人免费额度
# ============================================================

"@
  $body = Get-Content (Join-Path $here '.env.example') -Raw
  Set-Content -Path $envPath -Value ($header + $body) -Encoding UTF8
  Line '[2/5] 生成配置文件，正在打开记事本…' 'Yellow'
  Line '       填好 Key 后保存关闭，脚本会自动继续；直接关掉也行（走模拟模式）'
  Start-Process notepad.exe -ArgumentList $envPath -Wait
}
elseif ($openKey) {
  Line '[2/5] 打开配置文件…' 'Yellow'
  Start-Process notepad.exe -ArgumentList $envPath -Wait
}
else {
  Line '[2/5] 配置文件已存在'
}

$envText = if (Test-Path $envPath) { Get-Content $envPath -Raw } else { '' }
$hasKey = $envText -match '(?m)^[ \t]*(DEEPSEEK|SILICONFLOW|ZHIPU|DASHSCOPE|ARK|LLM)_(API_)?KEY[ \t]*=[ \t]*[^\r\n]*\S'
$allowRegister = $envText -match '(?m)^\s*ALLOW_REGISTER\s*=\s*0'

# 3. 构建
if (Test-Path (Join-Path $here 'dist\index.html')) {
  Line '[3/5] 已有构建产物，跳过构建'
}
else {
  Line '[3/5] 构建前端（约 15 秒）…' 'Yellow'
  npm run build
  if ($LASTEXITCODE -ne 0) {
    Line '构建失败，先看上面的报错。' 'Red'
    Pause
    exit 1
  }
}

# 4. 启动服务
$busy = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Line '[4/5] 8787 已有服务在运行，跳过启动'
}
else {
  Line '[4/5] 启动服务（关掉那个黑窗口就是停止）'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'node server/index.mjs' -WorkingDirectory $here
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) { break }
  }
}

# 5. 内网穿透
if ($skipTunnel) {
  Line '[5/5] 未开启内网穿透，本次只有本机能访问'
}
else {
  $cpolar = 'C:\Program Files\cpolar\cpolar.exe'
  if (Test-Path $cpolar) {
    Line '[5/5] 启动隧道（公网地址看新窗口里的 Forwarding 那行）'
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', "`"$cpolar`" http 8787" -WorkingDirectory $here
    Start-Sleep -Seconds 3
  }
  else {
    Line '[5/5] 没装 cpolar，跳过内网穿透（只有本机能访问）'
  }
}

Start-Process 'http://localhost:8787'

Write-Host ''
Line '  ----------------------------------------' 'DarkGray'
if ($hasKey) {
  Line '  AI：已配置 Key，使用真实模型' 'Green'
}
else {
  Line '  AI：未配置 Key，当前是模拟模式（回复为预设内容）' 'Yellow'
  Line '      想用真实模型：双击 start.bat key，填好保存后重启' 'DarkGray'
}
if ($allowRegister) {
  Line '  注册：已关闭（ALLOW_REGISTER=0），只能登录已有账号' 'Yellow'
}
Line '  本机访问：http://localhost:8787' 'Cyan'
Line '  给别人用：见「使用说明」第 19 节，或 README 的「给别人用」' 'DarkGray'
Line '  ----------------------------------------' 'DarkGray'
Write-Host ''
