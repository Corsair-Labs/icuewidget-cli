param([string]$InstallDir)

$ErrorActionPreference = 'SilentlyContinue'

$path = [Environment]::GetEnvironmentVariable('Path', 'User')
$parts = if ($path) { $path -split ';' | Where-Object { $_ -and ($_ -ine $InstallDir) } } else { @() }
[Environment]::SetEnvironmentVariable('Path', ($InstallDir + ';' + ($parts -join ';')), 'User')
