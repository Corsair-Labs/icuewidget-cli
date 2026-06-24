Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "x64.nsh"

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
!ifndef INSTALLER_RESOURCE_DIR
  !define INSTALLER_RESOURCE_DIR "${__FILEDIR__}\resources"
!endif

!define PRODUCT_NAME "iCUE Widget CLI"
!define PRODUCT_PUBLISHER "Corsair"
!define PRODUCT_BRAND "CORSAIR"

BrandingText "${PRODUCT_BRAND}"
!define INSTALL_REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define BRAND_ICON "${BRAND_ASSET_DIR}\corsair-cli.ico"
!define BRAND_WIZARD_BITMAP "${BRAND_ASSET_DIR}\InstallerSideImage.bmp"
!define NSIS_GRAPHICS_DIR "${NSISDIR}\Contrib\Graphics"
!define ADD_TO_PATH_SCRIPT "${INSTALLER_RESOURCE_DIR}\AddToPath.ps1"
!define CLEANUP_LEGACY_SCRIPT "${INSTALLER_RESOURCE_DIR}\CleanupLegacyPythonCli.ps1"

Name "${PRODUCT_NAME}"
OutFile "${OUT_FILE}"
InstallDir "$PROGRAMFILES\Corsair\iCUE Widget CLI"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
ShowInstDetails nevershow
ShowUnInstDetails nevershow

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install ${PRODUCT_NAME}"
!define MUI_WELCOMEPAGE_TEXT "This wizard installs ${PRODUCT_NAME}."
!define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} Installed"
!define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} is ready to use.$\r$\n$\r$\nOpen a new Command Prompt or PowerShell window and run: icuewidget"

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

; No header image — clean look, smaller installer.

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${If} ${RunningX64}
    SetRegView 64
    StrCpy $INSTDIR "$PROGRAMFILES64\Corsair\iCUE Widget CLI"
  ${EndIf}
FunctionEnd

Section "Install" SEC01
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=AddToPath.ps1 "${ADD_TO_PATH_SCRIPT}"
  File /oname=CleanupLegacyPythonCli.ps1 "${CLEANUP_LEGACY_SCRIPT}"

  DetailPrint "Cleaning up older CLI versions..."
  Call CleanupLegacyInstallations

  SetOutPath "$INSTDIR"

  DetailPrint "Installing ${PRODUCT_NAME}..."
  File /oname=icuewidget.exe "${CLI_BINARY}"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  DetailPrint "Adding icuewidget to system PATH..."
  nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\AddToPath.ps1" -InstallDir "$INSTDIR"'
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

  DetailPrint "Finalizing installation..."
  WriteRegStr HKLM "${INSTALL_REG_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${INSTALL_REG_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${INSTALL_REG_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${INSTALL_REG_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${INSTALL_REG_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "${INSTALL_REG_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKLM "${INSTALL_REG_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${INSTALL_REG_KEY}" "NoRepair" 1

  DetailPrint "Installation complete. Open a new terminal and run: icuewidget"
SectionEnd

Section "Uninstall"
  Call un.RemoveFromMachinePath
  Delete "$INSTDIR\icuewidget.exe"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "${INSTALL_REG_KEY}"
SectionEnd

; ---------------------------------------------------------------------------
; CleanupLegacyInstallations: best-effort cleanup for npm/pipx/uv/Python installs
; and old command shims before installing the native binary.
; ---------------------------------------------------------------------------
Function CleanupLegacyInstallations
  nsExec::Exec 'cmd.exe /c npm uninstall -g @icue/icuewidget-cli >nul 2>nul'
  nsExec::Exec 'cmd.exe /c pipx uninstall icuewidget-cli >nul 2>nul'
  nsExec::Exec 'cmd.exe /c uv tool uninstall icuewidget-cli >nul 2>nul'
  nsExec::Exec 'cmd.exe /c python -m pip uninstall -y icuewidget-cli >nul 2>nul'
  nsExec::Exec 'cmd.exe /c py -m pip uninstall -y icuewidget-cli >nul 2>nul'
  nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\CleanupLegacyPythonCli.ps1" -InstallDir "$INSTDIR"'
FunctionEnd

Function un.RemoveFromMachinePath
  nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$installDir = ''$INSTDIR''; $$path = [Environment]::GetEnvironmentVariable(''Path'', ''Machine''); $$parts = if ($$path) { $$path -split '';'' | Where-Object { $$_ -and ($$_ -ine $$installDir) } } else { @() }; [Environment]::SetEnvironmentVariable(''Path'', ($$parts -join '';''), ''Machine'')"'
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
FunctionEnd
