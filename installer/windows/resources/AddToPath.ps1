param([string]$InstallDir)

$ErrorActionPreference = 'SilentlyContinue'

$path = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$parts = if ($path) { $path -split ';' | Where-Object { $_ -and ($_ -ine $InstallDir) } } else { @() }
[Environment]::SetEnvironmentVariable('Path', ($InstallDir + ';' + ($parts -join ';')), 'Machine')
