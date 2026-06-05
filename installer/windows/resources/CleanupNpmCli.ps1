$ErrorActionPreference = 'SilentlyContinue'
if (Get-Command npm -ErrorAction SilentlyContinue) { npm uninstall -g @icue/icuewidget-cli 2>$null | Out-Null }
