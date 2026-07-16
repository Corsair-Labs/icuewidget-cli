$ErrorActionPreference = 'SilentlyContinue'
if (Get-Command npm -ErrorAction SilentlyContinue) { npm uninstall -g icuewidget-cli 2>$null | Out-Null }
