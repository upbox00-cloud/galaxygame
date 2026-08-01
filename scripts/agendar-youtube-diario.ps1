param(
  [string]$TaskName = "GalaxyGame - Atualizar trailers YouTube",
  [string]$Time = "05:00"
)

$ErrorActionPreference = "Stop"

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logsDir = Join-Path $projectDir "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$logFile = Join-Path $logsDir "atualizar-youtube.log"
$runnerScript = Join-Path $PSScriptRoot "run-youtube-diario.cmd"

$action = New-ScheduledTaskAction -Execute $runnerScript

$dailyTrigger = New-ScheduledTaskTrigger -Daily -At $Time
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger @($dailyTrigger, $logonTrigger) `
  -Settings $settings `
  -Description "Revalida trailers existentes e acrescenta novos trailers do YouTube ao catalogo GalaxyGame todos os dias. Tambem tenta ao iniciar sessao se a rotina ainda nao correu no dia." `
  -Force | Out-Null

Write-Host "Tarefa agendada criada/atualizada: $TaskName"
Write-Host "Horario diario: $Time"
Write-Host "Backup: tambem verifica ao iniciar sessao, sem repetir se ja correu no dia"
Write-Host "Projeto: $projectDir"
Write-Host "Log: $logFile"
