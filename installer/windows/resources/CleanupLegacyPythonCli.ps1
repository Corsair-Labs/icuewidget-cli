$ErrorActionPreference = 'SilentlyContinue'

$installDir = Join-Path $env:LOCALAPPDATA 'Programs\icuewidget-cli'

function Remove-LegacyIcuewidgetCommand($p) {
    if (-not $p) { return }
    $full = (Resolve-Path -LiteralPath $p -ErrorAction SilentlyContinue).Path
    if (-not $full) { return }
    if ($full -like ($installDir + '\*')) { return }
    $text = ''
    try {
        if ((Get-Item -LiteralPath $full -ErrorAction SilentlyContinue).Length -lt 1048576) {
            $text = Get-Content -LiteralPath $full -Raw -ErrorAction SilentlyContinue
        }
    } catch {}
    $isLegacy = ($full -match '\\(python|pipx|scripts|npm|node_modules)\\') -or
                ($full -match '@corsair|icuewidget_cli') -or
                ($text -match 'python|icuewidget_cli|@corsair/icuewidget-cli|node-bin/icuewidget')
    if (-not $isLegacy) { return }
    $stem = [IO.Path]::Combine([IO.Path]::GetDirectoryName($full), [IO.Path]::GetFileNameWithoutExtension($full))
    foreach ($candidate in @($full, ($stem + '.exe'), ($stem + '-script.py'), ($stem + '.exe.manifest'), ($stem + '.cmd'), ($stem + '.ps1'))) {
        Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue
    }
}

if (Get-Command pipx -ErrorAction SilentlyContinue) { pipx uninstall icuewidget-cli | Out-Null }
if (Get-Command uv -ErrorAction SilentlyContinue) { uv tool uninstall icuewidget-cli | Out-Null }

$paths = @()
$paths += @(where.exe icuewidget 2>$null)
$paths += @(Get-Command icuewidget -All -ErrorAction SilentlyContinue | ForEach-Object Source)

foreach ($p in ($paths | Select-Object -Unique)) { Remove-LegacyIcuewidgetCommand $p }
