param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logsDir = Join-Path $projectDir "logs"
$dataDir = Join-Path $projectDir "data"
$logFile = Join-Path $logsDir "atualizar-youtube.log"
$stampFile = Join-Path $dataDir "youtube-diario-ultimo-sucesso.json"
$lockFile = Join-Path $logsDir "youtube-diario.lock"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Invoke-NpmScript {
  param([string]$ScriptName)
  Write-Log "A executar npm run $ScriptName"
  Push-Location $projectDir
  try {
    & npm run $ScriptName *>> $logFile
    if ($LASTEXITCODE -ne 0) {
      throw "npm run $ScriptName terminou com codigo $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

$today = Get-Date -Format "yyyy-MM-dd"

if (-not $Force -and (Test-Path $stampFile)) {
  try {
    $lastRun = Get-Content $stampFile -Raw | ConvertFrom-Json
    if ($lastRun.lastSuccessDate -eq $today) {
      Write-Log "Atualizacao ja concluida hoje ($today). A saltar para evitar duplicar quota."
      exit 0
    }
  } catch {
    Write-Log "Nao foi possivel ler $stampFile. Vou tentar atualizar normalmente."
  }
}

if (Test-Path $lockFile) {
  $lockAgeHours = ((Get-Date) - (Get-Item $lockFile).LastWriteTime).TotalHours
  if ($lockAgeHours -lt 3) {
    Write-Log "Ja existe uma atualizacao em curso ou recente. Lock: $lockFile"
    exit 0
  }
  Write-Log "Lock antigo encontrado e substituido."
}

Set-Content -Path $lockFile -Value (Get-Date).ToString("o") -Encoding UTF8

try {
  Write-Log "===== YouTube diario iniciado ====="
  Invoke-NpmScript "revalidar-trailers"
  Invoke-NpmScript "trailers"
  Invoke-NpmScript "catalogo:lite"

  $stamp = @{
    lastSuccessDate = $today
    lastSuccessAt = (Get-Date).ToString("o")
  }
  $stamp | ConvertTo-Json | Set-Content -Path $stampFile -Encoding UTF8

  Write-Log "===== YouTube diario finalizado com sucesso ====="
} catch {
  Write-Log "ERRO na atualizacao diaria do YouTube: $($_.Exception.Message)"
  throw
} finally {
  Remove-Item -Path $lockFile -Force -ErrorAction SilentlyContinue
}
