param([string]$InstallDir)

$ErrorActionPreference = 'SilentlyContinue'

# Remove any previously installed icuewidget CLI binaries so a clean copy is installed.
# Two native install layouts exist in the wild:
#   1. Machine-wide (this installer):   %ProgramFiles%\Corsair\iCUE Widget CLI\icuewidget.exe
#   2. Per-user (Corsair Package Manager): %LOCALAPPDATA%\Programs\iCUEWidgetCLI\bin\icuewidget.exe
# The installer runs elevated, so per-user copies are cleaned across every user profile.

function Remove-DirSafely([string]$dir) {
    if ($dir -and (Test-Path -LiteralPath $dir)) {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Remove-FromPath([string]$scope, [string]$dir) {
    if (-not $dir) { return }
    $target = $dir.TrimEnd('\')
    $path = [Environment]::GetEnvironmentVariable('Path', $scope)
    if (-not $path) { return }
    $parts = $path -split ';' | Where-Object { $_ -and ($_.TrimEnd('\') -ine $target) }
    [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), $scope)
}

# --- 1. Machine-wide install(s) under Program Files (64- and 32-bit roots) ---
$machineDirs = @()
if ($env:ProgramFiles)        { $machineDirs += (Join-Path $env:ProgramFiles 'Corsair\iCUE Widget CLI') }
if (${env:ProgramFiles(x86)}) { $machineDirs += (Join-Path ${env:ProgramFiles(x86)} 'Corsair\iCUE Widget CLI') }

foreach ($dir in ($machineDirs | Select-Object -Unique)) {
    # Never remove the directory we are about to install into.
    if ($InstallDir -and ($dir.TrimEnd('\') -ieq $InstallDir.TrimEnd('\'))) { continue }
    $uninstaller = Join-Path $dir 'Uninstall.exe'
    if (Test-Path -LiteralPath $uninstaller) {
        Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -ErrorAction SilentlyContinue
    }
    Remove-DirSafely $dir
    Remove-FromPath 'Machine' $dir
}

# --- 2. Per-user installs (Corsair Package Manager) across every profile ---
$perUserSubdir = 'AppData\Local\Programs\iCUEWidgetCLI'
$usersRoot = if ($env:SystemDrive) { Join-Path $env:SystemDrive 'Users' } else { $null }
if ($usersRoot -and (Test-Path -LiteralPath $usersRoot)) {
    foreach ($profileDir in (Get-ChildItem -LiteralPath $usersRoot -Directory -ErrorAction SilentlyContinue)) {
        Remove-DirSafely (Join-Path $profileDir.FullName $perUserSubdir)
    }
}

# Best-effort: strip the per-user bin folder from the current environment's User PATH.
if ($env:LOCALAPPDATA) {
    Remove-FromPath 'User' (Join-Path $env:LOCALAPPDATA 'Programs\iCUEWidgetCLI\bin')
}
