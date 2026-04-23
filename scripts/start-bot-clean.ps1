$ErrorActionPreference = "SilentlyContinue"

$currentPid = $PID
$patterns = @(
  "--filter @eon/bot-service dev",
  "run dev:bot",
  "apps\\bot-service\\dist\\main.js"
)

$targets = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object {
    $_.ProcessId -ne $currentPid -and
    ($patterns | ForEach-Object { $_.CommandLine -like "*$_*" } | Where-Object { $_ } | Measure-Object).Count -gt 0
  } |
  Select-Object -ExpandProperty ProcessId

foreach ($pid in $targets) {
  taskkill /PID $pid /T /F | Out-Null
}

pnpm --filter @eon/bot-service dev
