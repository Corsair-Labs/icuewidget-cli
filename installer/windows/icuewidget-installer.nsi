!include "MUI2.nsh"
!include "WinMessages.nsh"

!ifndef VERSION
!error "VERSION define is required"
!endif

!ifndef BINARY_PATH
!error "BINARY_PATH define is required"
!endif

!ifndef OUTFILE
!error "OUTFILE define is required"
!endif

!define PRODUCT_NAME "iCUE Widget CLI"
!define PRODUCT_PUBLISHER "Corsair"
!define PRODUCT_BRAND "CORSAIR"
!define PRODUCT_WEB_SITE "https://www.corsair.com"
!ifndef BRAND_ASSET_DIR
!define BRAND_ASSET_DIR "installer\windows\assets"
!endif

!define BRAND_ICON "${BRAND_ASSET_DIR}\corsair-cli.ico"
!define BRAND_WIZARD_BITMAP "${BRAND_ASSET_DIR}\InstallerSideImage.bmp"
!define BRAND_HEADER_BITMAP "${BRAND_ASSET_DIR}\CORSAIRLogo2020_horiz_K.bmp"
!define NSIS_GRAPHICS_DIR "${NSISDIR}\Contrib\Graphics"

Name "${PRODUCT_NAME} ${VERSION}"
OutFile "${OUTFILE}"
BrandingText "${PRODUCT_BRAND}"

InstallDir "$LOCALAPPDATA\Programs\iCUEWidgetCLI"
InstallDirRegKey HKCU "Software\Corsair\iCUEWidgetCLI" "InstallDir"

RequestExecutionLevel user
Unicode true

!define MUI_ABORTWARNING
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADER_TRANSPARENT_TEXT
!define MUI_WELCOMEPAGE_TITLE "Install ${PRODUCT_NAME}"
!define MUI_WELCOMEPAGE_TEXT "This wizard installs ${PRODUCT_NAME} for your user account and adds it to your PATH."
!define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} Installed"
!define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} is ready to use from any new terminal window."
!define MUI_FINISHPAGE_LINK "Visit ${PRODUCT_BRAND}"
!define MUI_FINISHPAGE_LINK_LOCATION "${PRODUCT_WEB_SITE}"

; Prefer official CORSAIR branding assets from this repository.
!if /FileExists "${BRAND_ICON}"
  !define MUI_ICON "${BRAND_ICON}"
  !define MUI_UNICON "${BRAND_ICON}"
!else
  ; Fallback if branded icon files are unavailable.
  !if /FileExists "${NSIS_GRAPHICS_DIR}\Icons\orange-install.ico"
    !define MUI_ICON "${NSIS_GRAPHICS_DIR}\Icons\orange-install.ico"
  !endif
  !if /FileExists "${NSIS_GRAPHICS_DIR}\Icons\orange-uninstall.ico"
    !define MUI_UNICON "${NSIS_GRAPHICS_DIR}\Icons\orange-uninstall.ico"
  !endif
!endif

!if /FileExists "${BRAND_WIZARD_BITMAP}"
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${BRAND_WIZARD_BITMAP}"
!else
  !if /FileExists "${NSIS_GRAPHICS_DIR}\Wizard\orange.bmp"
    !define MUI_WELCOMEFINISHPAGE_BITMAP "${NSIS_GRAPHICS_DIR}\Wizard\orange.bmp"
  !endif
!endif

!if /FileExists "${BRAND_HEADER_BITMAP}"
  !define MUI_HEADERIMAGE_BITMAP "${BRAND_HEADER_BITMAP}"
!else
  !if /FileExists "${NSIS_GRAPHICS_DIR}\Header\orange.bmp"
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

!macro DefinePathListRemoveEntry FUNCNAME LABEL_PREFIX
Function ${FUNCNAME}
  ; Stack input (top first):
  ;   $1 -> entry to remove
  ;   $0 -> PATH list
  ; Returns cleaned PATH list on stack top.
  Exch $1
  Exch
  Exch $0

  Push $2
  Push $3
  Push $4
  Push $5
  Push $6

  StrCpy $2 $0
  StrCpy $3 ""
  StrCpy $4 ""
  StrCpy $6 "$1\"

  ${LABEL_PREFIX}PathListLoop:
    StrCpy $5 $2 1
    StrCmp $5 "" ${LABEL_PREFIX}PathListFinalize
    StrCmp $5 ";" ${LABEL_PREFIX}PathListProcessToken
    StrCpy $3 "$3$5"
    StrCpy $2 $2 "" 1
    Goto ${LABEL_PREFIX}PathListLoop

  ${LABEL_PREFIX}PathListProcessToken:
    StrCmp $3 "" ${LABEL_PREFIX}PathListAfterToken
    StrCmp $3 $1 ${LABEL_PREFIX}PathListAfterToken
    StrCmp $3 $6 ${LABEL_PREFIX}PathListAfterToken
    StrCmp $4 "" 0 +2
    StrCpy $4 "$3"
    StrCmp $4 "$3" ${LABEL_PREFIX}PathListAfterToken
    StrCpy $4 "$4;$3"

  ${LABEL_PREFIX}PathListAfterToken:
    StrCpy $3 ""
    StrCpy $2 $2 "" 1
    Goto ${LABEL_PREFIX}PathListLoop

  ${LABEL_PREFIX}PathListFinalize:
    StrCmp $3 "" ${LABEL_PREFIX}PathListDone
    StrCmp $3 $1 ${LABEL_PREFIX}PathListDone
    StrCmp $3 $6 ${LABEL_PREFIX}PathListDone
    StrCmp $4 "" 0 +2
    StrCpy $4 "$3"
    StrCmp $4 "$3" ${LABEL_PREFIX}PathListDone
    StrCpy $4 "$4;$3"

  ${LABEL_PREFIX}PathListDone:
    StrCpy $8 $4
    Pop $6
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $0
    Pop $1
    Push $8
FunctionEnd
!macroend

!insertmacro DefinePathListRemoveEntry PathListRemoveEntry ""
!insertmacro DefinePathListRemoveEntry un.PathListRemoveEntry "UN_"

Section "Install"
  SetOutPath "$INSTDIR\bin"
  File "/oname=icuewidget.exe" "${BINARY_PATH}"

  WriteRegStr HKCU "Software\Corsair\iCUEWidgetCLI" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ReadRegStr $0 HKCU "Environment" "Path"
  Push "$0"
  Push "$INSTDIR\bin"
  Call PathListRemoveEntry
  Pop $1

  StrCmp $1 "" path_set_only path_append
  path_set_only:
    StrCpy $2 "$INSTDIR\bin"
    Goto write_path

  path_append:
    StrCpy $2 "$1;$INSTDIR\bin"

  write_path:
    WriteRegExpandStr HKCU "Environment" "Path" "$2"
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000

SectionEnd

Section "Uninstall"
  ReadRegStr $0 HKCU "Environment" "Path"
  StrCmp $0 "" path_cleanup_done

  Push "$0"
  Push "$INSTDIR\bin"
  Call un.PathListRemoveEntry
  Pop $1

  StrCmp $1 "" clear_user_path write_user_path
  clear_user_path:
    DeleteRegValue HKCU "Environment" "Path"
    Goto notify_environment_update

  write_user_path:
    WriteRegExpandStr HKCU "Environment" "Path" "$1"

  notify_environment_update:
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000

  path_cleanup_done:
  Delete "$INSTDIR\bin\icuewidget.exe"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR\bin"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Corsair\iCUEWidgetCLI"
SectionEnd
