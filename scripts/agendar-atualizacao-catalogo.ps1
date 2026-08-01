param(
  [string]$TaskName = "GalaxyGame - Atualizar catalogo",
  [string]$Time = "04:00"
)

$ErrorActionPreference = "Stop"

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logsDir = Join-Path $projectDir "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$logFile = Join-Path $logsDir "atualizar-catalogo.log"
$npmCommand = "cd /d `"$projectDir`" && npm run atualizar:catalogo >> `"$logFile`" 2>&1"

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c $npmCommand"
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Atualiza automaticamente o catalogo GalaxyGame com produtos do fornecedor, precos em EUR, capas, curadoria e trailers do YouTube." `
  -Force | Out-Null

Write-Host "Tarefa agendada criada/atualizada: $TaskName"
Write-Host "Horario diario: $Time"
Write-Host "Projeto: $projectDir"
Write-Host "Log: $logFile"
