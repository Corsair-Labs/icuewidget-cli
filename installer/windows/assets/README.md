# CORSAIR Windows branding assets

This directory contains official CORSAIR-derived artwork used by the Windows CLI deliverables:

- `corsair-cli.ico`: icon for `icuewidget.exe` and NSIS installer/uninstaller
- `CORSAIRLogo2020_horiz_K.png`: source logo used to generate the NSIS header bitmap
- `CORSAIRLogo2020_horiz_K.bmp`: NSIS header image (`MUI_HEADERIMAGE_BITMAP`)
- `InstallerSideImage.bmp`: pre-rendered NSIS welcome/finish side image (`MUI_WELCOMEFINISHPAGE_BITMAP`)

## Source logos (official)

The base logo was downloaded from CORSAIR's official logos page:

- https://www.corsair.com/newsroom/company-logos
- https://cwsmgmt.corsair.com/press/CORSAIRLogo2020_horiz_K.png

## Notes

- Keep these assets aligned with the latest CORSAIR brand guidance.
- If logos are updated by CORSAIR, regenerate this directory from fresh official source files.
- `InstallerSideImage.bmp` and `CORSAIRLogo2020_horiz_K.bmp` are committed intentionally so installer builds do not need image-conversion dependencies.
