# CORSAIR Windows branding assets

This directory contains official CORSAIR-derived artwork used by the Windows CLI deliverables:

- `corsair-cli.ico`: icon for `icuewidget.exe` and NSIS installer/uninstaller
- `CORSAIRLogo2020_horiz_K.bmp`: NSIS header image (`MUI_HEADERIMAGE_BITMAP`)
- `InstallerSideImage.bmp`: pre-rendered NSIS welcome/finish side image (`MUI_WELCOMEFINISHPAGE_BITMAP`)

## Notes

- Keep these assets aligned with the latest CORSAIR brand guidance.
- If logos are updated by CORSAIR, regenerate this directory from fresh official source files.
- `InstallerSideImage.bmp` and `CORSAIRLogo2020_horiz_K.bmp` are committed intentionally so installer builds do not need image-conversion dependencies.
