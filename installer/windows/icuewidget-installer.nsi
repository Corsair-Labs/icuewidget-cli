Unicode true
!include "MUI2.nsh"
!include "WordFunc.nsh"
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
  Call CleanupNpmGlobal
  SetOutPath "$INSTDIR"
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

; ---------------------------------------------------------------------------
; AddToPath: Prepends $INSTDIR to the user's PATH.  Pure NSIS — no external
; process launched, so Norton/Security software sees nothing to flag.
; ---------------------------------------------------------------------------
Function AddToPath
  ReadRegStr $0 HKCU "Environment" "Path"
  Push "$0"
  Push "$INSTDIR"
  Call RemovePathSegment
  Pop $0

  ${If} $0 == ""
    StrCpy $0 "$INSTDIR"
  ${Else}
    StrCpy $0 "$INSTDIR;$0"
  ${EndIf}

  WriteRegExpandStr HKCU "Environment" "Path" "$0"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
FunctionEnd

; ---------------------------------------------------------------------------
; RemovePathSegment: given a semicolon-separated list and a segment,
; returns the list with that segment removed.
; Stack: top=segment, bottom=list  →  top=list
; ---------------------------------------------------------------------------
Function RemovePathSegment
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

; ---------------------------------------------------------------------------
; Uninstaller helper
; ---------------------------------------------------------------------------
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
