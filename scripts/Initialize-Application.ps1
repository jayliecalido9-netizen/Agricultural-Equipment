[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$environmentPath=Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $environmentPath)) { & (Join-Path $PSScriptRoot 'Initialize-Environment.ps1') }
$content=[IO.File]::ReadAllText($environmentPath)
if ($content -notmatch '(?m)^JWT_SECRET=.{48,}$') {
  $bytes=New-Object byte[] 48
  $random=[Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($bytes) } finally { $random.Dispose() }
  $secret=([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
  $content=$content.TrimEnd()+[Environment]::NewLine+'JWT_SECRET='+$secret+[Environment]::NewLine
}
foreach ($entry in @('FRONTEND_ORIGIN=http://localhost:3000','COOKIE_SECURE=false','PORT=5000','UPLOAD_DIRECTORY=uploads','INTEGRATION_ALLOWED_HOSTS=')) {
  $key=$entry.Split('=')[0]
  if ($content -notmatch ('(?m)^'+$key+'=')) { $content+=$entry+[Environment]::NewLine }
}
[IO.File]::WriteAllText($environmentPath,$content,(New-Object Text.UTF8Encoding($false)))
Write-Host 'Application configuration is ready. Existing credentials were preserved.'
