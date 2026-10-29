[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
  & (Join-Path $PSScriptRoot 'Test-DockerStorage.ps1')
  npx tsx scripts/check-production.ts
  if ($LASTEXITCODE -ne 0) { throw 'Production preflight failed. No services were changed.' }
  $compose=@('compose','-p','aeams-production','--env-file','.env.production','-f','docker-compose.yml','-f','docker-compose.production.yml')
  docker @compose config --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Invalid production Compose configuration. Use Docker Compose 2.24.4 or later.' }
  docker @compose up -d --build --wait --wait-timeout 240
  if ($LASTEXITCODE -ne 0) { throw 'Deployment did not become healthy. Inspect production service logs.' }
  docker @compose --profile tools run --build --rm db-tools npm run db:check
  if ($LASTEXITCODE -ne 0) { throw 'Database privileges check failed.' }
  Write-Host 'Production containers are ready. Verify HTTPS and create the first administrator using docs/production.md.'
} finally { Pop-Location }
