[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $environmentPath) {
  throw '.env already exists. Keep the existing credentials or edit it explicitly; this script does not overwrite them.'
}
function New-RandomSecret {
  $bytes = New-Object byte[] 24
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
$adminPassword = New-RandomSecret
$migrationPassword = New-RandomSecret
$applicationPassword = New-RandomSecret
$demoPassword = New-RandomSecret
$config = @"
POSTGRES_DB=agriconnect
POSTGRES_PORT=5432
POSTGRES_ADMIN_PASSWORD=$adminPassword
AEAMS_MIGRATOR_PASSWORD=$migrationPassword
AEAMS_APP_PASSWORD=$applicationPassword
DATABASE_URL=postgresql://aeams_migrator:${migrationPassword}@localhost:5432/agriconnect?schema=aeams
APP_DATABASE_URL=postgresql://aeams_app:${applicationPassword}@localhost:5432/agriconnect?schema=aeams
ALLOW_DEMO_SEED=false
DEMO_ADMIN_EMAIL=admin@example.test
DEMO_ADMIN_PASSWORD=$demoPassword
"@
[IO.File]::WriteAllText($environmentPath, $config + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
Write-Host 'Created .env with random credentials. Demo seeding is disabled. Do not commit this file.'
