# Daftarkan worker analisis AI lokal ke Windows Task Scheduler.
# Berjalan setiap N menit selama Anda login. Tidak butuh hak admin dan tidak menyimpan password.
#   powershell -ExecutionPolicy Bypass -File scripts\windows\register-analysis-task.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows\register-analysis-task.ps1 -Remove
param(
  [int]$IntervalMinutes = 30,
  [string]$TaskName = "ThreadsLeadHunter-AI-Worker",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Task $TaskName dihapus."
  exit 0
}

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$logDir = Join-Path $projectDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "worker-analyze.log"

if (-not (Test-Path (Join-Path $projectDir ".secrets\worker.env"))) {
  throw "File .secrets\worker.env belum ada. Lihat docs\LOCAL_AI.md."
}

# cmd /c dipakai agar output npm bisa diarahkan ke file log.
$arguments = "/c cd /d `"$projectDir`" && `"$npm`" run worker:analyze >> `"$log`" 2>&1"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $arguments -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "Threads Lead Hunter: analisis lead pending dengan Ollama lokal setiap $IntervalMinutes menit" -Force | Out-Null

Write-Output "Task $TaskName terdaftar: setiap $IntervalMinutes menit, mulai 1 menit lagi."
Write-Output "Log: $log"
