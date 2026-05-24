Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

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
!define BRAND_HEADER_BITMAP "${BRAND_ASSET_DIR}\CORSAIRLogo2020_horiz_K.bmp"
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
  Call WarnDuplicateNpmCli
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
  ReadRegStr $0 HKCU "Environment" "Path"
  ${If} $0 == ""
    WriteRegExpandStr HKCU "Environment" "Path" "$INSTDIR"
  ${Else}
    ${StrStr} $1 "$0" "$INSTDIR"
    ${If} $1 == ""
      WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR"
    ${EndIf}
  ${EndIf}
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
FunctionEnd

Function CleanupLegacyPythonCli
  ; Best-effort cleanup for Python/pipx/uv-installed versions. All commands are
  ; allowed to fail so installer success never depends on Python being present.
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = ''SilentlyContinue''; if (Get-Command pipx -ErrorAction SilentlyContinue) { pipx uninstall icuewidget-cli | Out-Null }; if (Get-Command uv -ErrorAction SilentlyContinue) { uv tool uninstall icuewidget-cli | Out-Null }; $paths = @(where.exe icuewidget 2>$null); foreach ($p in $paths) { if (-not $p) { continue }; if ($p -like "$env:LOCALAPPDATA\Programs\icuewidget-cli\*") { continue }; $text = Get-Content -LiteralPath $p -Raw -ErrorAction SilentlyContinue; if (($p -match ''Python|pipx|Scripts\\icuewidget'') -or ($text -match ''python|icuewidget_cli'')) { Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue } }"'
FunctionEnd

Function WarnDuplicateNpmCli
  ; Detect npm-installed copies without removing them. The standalone installer
  ; can coexist with npm, but PATH order decides which `icuewidget` runs.
  nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = ''SilentlyContinue''; $found = @(); if (Get-Command npm -ErrorAction SilentlyContinue) { $prefix = npm prefix -g 2>$null; if ($prefix) { foreach ($name in @(''icuewidget.cmd'', ''icuewidget.ps1'', ''icuewidget'')) { $candidate = Join-Path $prefix $name; if (Test-Path -LiteralPath $candidate) { $found += $candidate } } } }; foreach ($p in @(where.exe icuewidget 2>$null)) { if (-not $p) { continue }; if ($p -like "$env:LOCALAPPDATA\\Programs\\icuewidget-cli\\*") { continue }; $text = Get-Content -LiteralPath $p -Raw -ErrorAction SilentlyContinue; if (($p -match ''\\npm\\|node_modules|@corsair'') -or ($text -match ''@corsair/icuewidget-cli|node-bin/icuewidget'')) { $found += $p } }; $found | Sort-Object -Unique | Select-Object -First 5"'
  Pop $0
  Pop $1
  ${If} $1 != ""
    DetailPrint "Detected an npm-installed icuewidget command:"
    DetailPrint "$1"
    MessageBox MB_ICONEXCLAMATION|MB_OK "Another npm-installed icuewidget command was detected:$\r$\n$\r$\n$1$\r$\n$\r$\nThe native installer will not remove it. If both remain installed, your PATH order decides which version runs. To avoid confusion, uninstall one copy, for example:$\r$\n$\r$\nnpm uninstall -g @corsair/icuewidget-cli"
  ${EndIf}
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
