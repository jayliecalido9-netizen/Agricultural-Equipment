[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Domain,
  [Parameter(Mandatory=$true)][string]$CertificateEmail
)
$ErrorActionPreference='Stop'
if ($Domain -notmatch '^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$') { throw 'Provide a DNS domain such as equipment.your-office.gov.ph, without a protocol or path.' }
if ($CertificateEmail -notmatch '^[a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$') { throw 'Provide a valid certificate contact email.' }
$projectRoot=Split-Path -Parent $PSScriptRoot
$target=Join-Path $projectRoot '.env.production'
if (Test-Path -LiteralPath $target) { throw '.env.production already exists. Existing production credentials were preserved.' }
function New-DeploymentSecret {
  $bytes=New-Object byte[] 48
  $random=[Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($bytes) } finally { $random.Dispose() }
  return ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
}
$adminSecret=New-DeploymentSecret
$migratorSecret=New-DeploymentSecret
$runtimeSecret=New-DeploymentSecret
$jwtSecret=New-DeploymentSecret
$content=@"
AEAMS_DOMAIN=$($Domain.ToLowerInvariant())
ACME_EMAIL=$CertificateEmail
POSTGRES_DB=agriconnect
POSTGRES_ADMIN_PASSWORD=$adminSecret
AEAMS_MIGRATOR_PASSWORD=$migratorSecret
AEAMS_APP_PASSWORD=$runtimeSecret
DATABASE_URL=postgresql://aeams_migrator:${migratorSecret}@db:5432/agriconnect?schema=aeams
APP_DATABASE_URL=postgresql://aeams_app:${runtimeSecret}@db:5432/agriconnect?schema=aeams
JWT_SECRET=$jwtSecret
NODE_ENV=production
FRONTEND_ORIGIN=https://$($Domain.ToLowerInvariant())
COOKIE_SECURE=true
TRUST_PROXY_HOPS=2
ALLOW_DEMO_SEED=false
DEMO_ADMIN_PASSWORD=
INTEGRATION_ALLOWED_HOSTS=
"@
# CreateNew avoids overwriting credentials if two initializations race.
$stream=New-Object IO.FileStream($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
try { $data=(New-Object Text.UTF8Encoding($false)).GetBytes($content+[Environment]::NewLine);$stream.Write($data,0,$data.Length) } finally { $stream.Dispose() }
Write-Host 'Created .env.production with separate random deployment credentials. No secrets were printed.'
Write-Host 'Use this file only on a fresh deployment database, not against the current local database volume.'
