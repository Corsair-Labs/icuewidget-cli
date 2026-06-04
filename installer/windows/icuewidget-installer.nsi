Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "WordFunc.nsh"
!insertmacro WordFind

!ifndef PRODUCT_VERSION
  !define PRODUCT_VERSION "1.0.0"
!endif
!ifndef CLI_BINARY
  !define CLI_BINARY "..\..\dist\bin\icuewidget.exe"
!endif
!ifndef OUT_FILE
  !define OUT_FILE "..\..\release\icuewidget-${PRODUCT_VERSION}-windows-installer.exe"
!endif
!ifndef BRAND_ASSET_DIR
  !define BRAND_ASSET_DIR "${__FILEDIR__}\assets"
!endif

!define PRODUCT_NAME "iCUE Widget CLI"
!define PRODUCT_PUBLISHER "Corsair"
!define PRODUCT_BRAND "CORSAIR"
!define INSTALL_REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define BRAND_ICON "${BRAND_ASSET_DIR}\corsair-cli.ico"
!define BRAND_WIZARD_BITMAP "${BRAND_ASSET_DIR}\InstallerSideImage.bmp"
!define BRAND_HEADER_BITMAP "${BRAND_ASSET_DIR}\CorsairLogo.bmp"
!define NSIS_GRAPHICS_DIR "${NSISDIR}\Contrib\Graphics"

Name "${PRODUCT_NAME}"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\icuewidget-cli"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUnInstDetails show

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install ${PRODUCT_NAME}"
!define MUI_WELCOMEPAGE_TEXT "This wizard installs ${PRODUCT_NAME} for your user account and adds it to your PATH."
!define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} Installed"
!define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} is ready to use from any new terminal window."

!if /FileExists "${BRAND_ICON}"
  !define MUI_ICON "${BRAND_ICON}"
  !define MUI_UNICON "${BRAND_ICON}"
!endif

!if /FileExists "${BRAND_WIZARD_BITMAP}"
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${BRAND_WIZARD_BITMAP}"
!else
  !if /FileExists "${NSIS_GRAPHICS_DIR}\Wizard\orange.bmp"
    !define MUI_WELCOMEFINISHPAGE_BITMAP "${NSIS_GRAPHICS_DIR}\Wizard\orange.bmp"
  !endif
!endif

!if /FileExists "${BRAND_HEADER_BITMAP}"
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_RIGHT
  !define MUI_HEADERIMAGE_BITMAP "${BRAND_HEADER_BITMAP}"
!else
  !if /FileExists "${NSIS_GRAPHICS_DIR}\Header\orange.bmp"
    !define MUI_HEADERIMAGE
    !define MUI_HEADERIMAGE_RIGHT
    !define MUI_HEADERIMAGE_BITMAP "${NSIS_GRAPHICS_DIR}\Header\orange.bmp"
  !endif
!endif

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Install" SEC01
  SetOutPath "$INSTDIR"
  Call CleanupLegacyPythonCli
  Call CleanupNpmCli
  File /oname=icuewidget.exe "${CLI_BINARY}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "${INSTALL_REG_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${INSTALL_REG_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${INSTALL_REG_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${INSTALL_REG_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${INSTALL_REG_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${INSTALL_REG_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${INSTALL_REG_KEY}" "NoRepair" 1

  Call AddToPath
SectionEnd

Section "Uninstall"
  Call un.RemoveFromPath
  Delete "$INSTDIR\icuewidget.exe"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${INSTALL_REG_KEY}"
SectionEnd

Function AddToPath
  ; Put the native installer directory first in the user's PATH. Appending can
  ; leave older Python/npm shims earlier in PATH, so `icuewidget` still resolves
  ; to the old version after a successful install.
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$ErrorActionPreference = ''SilentlyContinue''; $$installDir = ''$INSTDIR''; $$path = [Environment]::GetEnvironmentVariable(''Path'', ''User''); $$parts = @(); if ($$path) { $$parts = $$path -split '';'' | Where-Object { $$_ -and ($$_ -ine $$installDir) } }; [Environment]::SetEnvironmentVariable(''Path'', ($$installDir + '';'' + ($$parts -join '';'')), ''User'')"'
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
FunctionEnd

Function CleanupLegacyPythonCli
  ; Best-effort cleanup for Python/pipx/uv-installed versions. All commands are
  ; allowed to fail so installer success never depends on Python being present.
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$ErrorActionPreference = ''SilentlyContinue''; $$installDir = Join-Path $$env:LOCALAPPDATA ''Programs\icuewidget-cli''; function Remove-LegacyIcuewidgetCommand($$p) { if (-not $$p) { return }; $$full = (Resolve-Path -LiteralPath $$p -ErrorAction SilentlyContinue).Path; if (-not $$full) { return }; if ($$full -like ($$installDir + ''\*'')) { return }; $$text = ''''; try { if ((Get-Item -LiteralPath $$full -ErrorAction SilentlyContinue).Length -lt 1048576) { $$text = Get-Content -LiteralPath $$full -Raw -ErrorAction SilentlyContinue } } catch {}; $$isLegacy = ($$full -match ''(?i)\\(python|pipx|scripts|npm|node_modules)\\|@corsair|icuewidget_cli'') -or ($$text -match ''(?i)python|icuewidget_cli|@corsair/icuewidget-cli|node-bin/icuewidget''); if (-not $$isLegacy) { return }; $$stem = [IO.Path]::Combine([IO.Path]::GetDirectoryName($$full), [IO.Path]::GetFileNameWithoutExtension($$full)); foreach ($$candidate in @($$full, ($$stem + ''.exe''), ($$stem + ''-script.py''), ($$stem + ''.exe.manifest''), ($$stem + ''.cmd''), ($$stem + ''.ps1''))) { Remove-Item -LiteralPath $$candidate -Force -ErrorAction SilentlyContinue } }; if (Get-Command pipx -ErrorAction SilentlyContinue) { pipx uninstall icuewidget-cli | Out-Null }; if (Get-Command uv -ErrorAction SilentlyContinue) { uv tool uninstall icuewidget-cli | Out-Null }; $$paths = @(); $$paths += @(where.exe icuewidget 2>$$null); $$paths += @(Get-Command icuewidget -All -ErrorAction SilentlyContinue | ForEach-Object Source); foreach ($$p in ($$paths | Select-Object -Unique)) { Remove-LegacyIcuewidgetCommand $$p }"'
FunctionEnd

Function CleanupNpmCli
  ; Best-effort removal of any npm-globally-installed icuewidget-cli. The native
  ; binary supersedes the npm package; all commands are allowed to fail so the
  ; installer never depends on npm being present.
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$ErrorActionPreference = ''SilentlyContinue''; if (Get-Command npm -ErrorAction SilentlyContinue) { npm uninstall -g @corsair/icuewidget-cli 2>$$null | Out-Null }"'
FunctionEnd

Function un.RemoveFromPath
  ReadRegStr $0 HKCU "Environment" "Path"
  ${If} $0 != ""
    Push "$0"
    Push "$INSTDIR"
    Call un.RemovePathSegment
    Pop $0
    WriteRegExpandStr HKCU "Environment" "Path" "$0"
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${EndIf}
FunctionEnd

Function un.RemovePathSegment
  Exch $1
  Exch
  Exch $0
  Push $2
  Push $3
  StrCpy $2 ""
  ${Do}
    ${WordFind} "$0" ";" "+1" $3
    ${If} $3 == ""
      ${Break}
    ${EndIf}
    ${If} $3 != $1
      ${If} $2 == ""
        StrCpy $2 "$3"
      ${Else}
        StrCpy $2 "$2;$3"
      ${EndIf}
    ${EndIf}
    ${WordFind} "$0" ";" "E+1" $0
  ${Loop}
  Pop $3
  Exch $2
  Exch
  Pop $1
FunctionEnd
