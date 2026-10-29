[CmdletBinding()]
param([switch]$Demo)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
  & (Join-Path $PSScriptRoot 'Test-DockerStorage.ps1')
  & (Join-Path $PSScriptRoot 'Initialize-Application.ps1')
  $environmentContent=[IO.File]::ReadAllText((Join-Path $projectRoot '.env'))
  function Get-ConfiguredValue([string]$Key) {
    $processValue=[Environment]::GetEnvironmentVariable($Key,'Process')
    if ($processValue) { return $processValue }
    $match=[regex]::Match($environmentContent,'(?m)^'+[regex]::Escape($Key)+'=(.*)$')
    return $match.Groups[1].Value.Trim().Trim('"').Trim("'")
  }
  foreach ($pair in @(@('DATABASE_URL','AEAMS_MIGRATOR_PASSWORD'),@('APP_DATABASE_URL','AEAMS_APP_PASSWORD'))) {
    $connectionUri=$null
    $valid=[Uri]::TryCreate((Get-ConfiguredValue $pair[0]),[UriKind]::Absolute,[ref]$connectionUri)
    if (-not $valid) { throw 'Invalid database connection URL in .env. No credentials were displayed.' }
    $credentials=$connectionUri.UserInfo -split ':',2
    if ($credentials.Count -ne 2 -or [Uri]::UnescapeDataString($credentials[1]) -ne (Get-ConfiguredValue $pair[1])) {
      throw 'Database password fields and connection URLs in .env do not match. These are internal database credentials; use DEMO_ADMIN_PASSWORD for website login. Restore the matching settings before starting containers.'
    }
  }
  docker compose config --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Invalid Docker Compose configuration.' }
  docker compose up -d --build --wait
  if ($LASTEXITCODE -ne 0) { throw 'Application startup failed. Check Docker Desktop and docker compose logs.' }
  if ($Demo) {
    docker compose --profile tools run --build --rm -e ALLOW_DEMO_SEED=true db-tools npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw 'Demo seed failed.' }
  }
  $environment=[IO.File]::ReadAllText((Join-Path $projectRoot '.env'))
  $originMatch=[regex]::Match($environment,'(?m)^FRONTEND_ORIGIN=(.+)$')
  $frontendUrl=if($originMatch.Success){$originMatch.Groups[1].Value.Trim()}else{'http://localhost:3000'}
  Write-Host "AEAMS is available at $frontendUrl"
  Write-Host 'API documentation: http://localhost:5000/api-docs/'
  if ($Demo) { Write-Host 'Development passwords are in your local .env (DEMO_ADMIN_PASSWORD). No credentials were printed.' }
} finally { Pop-Location }
