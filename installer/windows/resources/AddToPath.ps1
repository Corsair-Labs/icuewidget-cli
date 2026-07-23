param([string]$InstallDir, [string]$Scope = 'User')

$ErrorActionPreference = 'SilentlyContinue'

$path = [Environment]::GetEnvironmentVariable('Path', $Scope)
$parts = if ($path) { $path -split ';' | Where-Object { $_ -and ($_ -ine $InstallDir) } } else { @() }
[Environment]::SetEnvironmentVariable('Path', ($InstallDir + ';' + ($parts -join ';')), $Scope)
