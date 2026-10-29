[CmdletBinding()]
param([string]$Directory = 'backups')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
  $backupDirectory = [IO.Path]::GetFullPath((Join-Path $projectRoot $Directory))
  New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
  $backupName = 'agriconnect-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump'
  $containerFile = '/tmp/' + $backupName
  # Binary pg_dump output goes to a file, avoiding PowerShell text redirection.
  docker compose exec -T db sh -c 'pg_dump -U postgres -d "$POSTGRES_DB" --format=custom --file="$1"' sh $containerFile
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }
  docker compose cp "db:$containerFile" (Join-Path $backupDirectory $backupName)
  if ($LASTEXITCODE -ne 0) { throw 'Copying backup failed.' }
  docker compose exec -T db rm -- $containerFile
  if ($LASTEXITCODE -ne 0) { throw 'Removing temporary container backup failed.' }
  Write-Host "Backup saved to $backupDirectory\$backupName"
} finally { Pop-Location }
