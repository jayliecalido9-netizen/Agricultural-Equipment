[CmdletBinding()]
param([long]$MinimumFreeBytes=10GB)
$ErrorActionPreference='Stop'
if (-not $env:LOCALAPPDATA) { return }
$defaultDiskDirectory=Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk'
if (-not (Test-Path -LiteralPath (Join-Path $defaultDiskDirectory 'docker_data.vhdx'))) { return }
$directory=Get-Item -LiteralPath $defaultDiskDirectory
$storagePath=$directory.FullName
if ($directory.LinkType -eq 'Junction' -or $directory.LinkType -eq 'SymbolicLink') {
  $target=@($directory.Target)[0]
  if ([IO.Path]::IsPathRooted($target)) { $storagePath=$target }
  else { $storagePath=[IO.Path]::GetFullPath((Join-Path $directory.Parent.FullName $target)) }
}
$drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($storagePath))
if ($drive.AvailableFreeSpace -lt $MinimumFreeBytes) {
  throw ('Docker storage drive '+$drive.Name+' needs at least '+[math]::Round($MinimumFreeBytes/1GB)+' GB free before rebuilding. Free space or relocate Docker storage while it is safely stopped. Do not delete database volumes.')
}
Write-Host ('Docker storage check passed on '+$drive.Name+' ('+[math]::Round($drive.AvailableFreeSpace/1GB,1)+' GB free).')
