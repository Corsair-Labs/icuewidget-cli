Unicode true
!include "MUI2.nsh"
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

BrandingText "${PRODUCT_BRAND}"
!define INSTALL_REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define BRAND_ICON "${BRAND_ASSET_DIR}\corsair-cli.ico"
!define BRAND_WIZARD_BITMAP "${BRAND_ASSET_DIR}\InstallerSideImage.bmp"
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
!define MUI_WELCOMEPAGE_TEXT "This wizard installs ${PRODUCT_NAME} for your user account."
!define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} Installed"
!define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} has been installed to:$\\n$\\n$INSTDIR$\\n$\\nUse the full path or add it to your PATH manually."

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

Section "Install" SEC01
  DetailPrint "[1/7] Cleaning up old installations..."
  Call CleanupNpmGlobal

  DetailPrint "[2/7] Creating install directory..."
  SetOutPath "$INSTDIR"

  DetailPrint "[3/7] Extracting icuewidget.exe..."
  File /oname=icuewidget.exe "${CLI_BINARY}"

  DetailPrint "[4/7] Creating uninstaller..."
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  DetailPrint "[5/7] Writing registry entries..."
  WriteRegStr HKCU "${INSTALL_REG_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${INSTALL_REG_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${INSTALL_REG_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${INSTALL_REG_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${INSTALL_REG_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${INSTALL_REG_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${INSTALL_REG_KEY}" "NoRepair" 1

  DetailPrint "[6/7] Installation complete."
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\icuewidget.exe"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${INSTALL_REG_KEY}"
SectionEnd

; ---------------------------------------------------------------------------
; CleanupNpmGlobal: Uninstall any npm/pipx/uv global package.  Uses cmd.exe
; which is a fraction of the size of PowerShell and triggers much fewer
; security alerts.  All commands are best-effort (2>nul silence).
; ---------------------------------------------------------------------------
Function CleanupNpmGlobal
  nsExec::ExecToLog 'cmd.exe /c npm uninstall -g @icue/icuewidget-cli 2>nul'
  nsExec::ExecToLog 'cmd.exe /c pipx uninstall icuewidget-cli 2>nul'
  nsExec::ExecToLog 'cmd.exe /c uv tool uninstall icuewidget-cli 2>nul'
FunctionEnd


