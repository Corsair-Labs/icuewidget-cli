# CLI Release Packaging

This repository includes a release workflow for shipping standalone `icuewidget` binaries and installer artifacts for macOS and Windows.

## What it does

- builds a one-file executable with PyInstaller
- produces a platform-specific release folder
- builds a user-friendly installer artifact per platform
- archives the folder for distribution
- publishes the archives to GitHub Releases when a release tag is pushed

## Supported release targets

- macOS
- Windows

## Local maintainer workflow

Install build dependencies:

```bash
pip install .[build]
```

Build a standalone artifact for the current platform:

```bash
python build_standalone.py
```

Build installer artifact for the current platform:

```bash
python build_installers.py
```

Artifacts are written to:

- `release/icuewidget-<version>-macos/`
- `release/icuewidget-<version>-windows/`
- corresponding `.zip` archives in `release/`
- `release/icuewidget-<version>-macos-installer.pkg`
- `release/icuewidget-<version>-windows-installer.exe`

### Windows installer branding

Windows packaging uses official CORSAIR branding assets:

- installer branding text: `CORSAIR`
- iCUE Widget CLI welcome/finish copy with CORSAIR website link (`https://www.corsair.com`)
- installer/uninstaller icon: `installer/windows/assets/corsair-cli.ico`
- installer wizard/header art: `installer/windows/assets/corsair-wizard.bmp` and `installer/windows/assets/corsair-header.bmp`
- standalone `icuewidget.exe` icon: `installer/windows/assets/corsair-cli.ico`

Base source logos are tracked in:

- `installer/windows/assets/src/`

## GitHub Actions workflow

Workflow file:

- `.github/workflows/release-cli.yml`

### Triggers

- manual run via `workflow_dispatch`
- tag push matching:

```text
icuewidget-cli-v*
```

Example:

```text
icuewidget-cli-v0.1.0
```

### Release behavior

- `macos-latest` builds a standalone `icuewidget` binary
- `windows-latest` builds a standalone `icuewidget.exe` binary
- `macos-latest` builds a `.pkg` installer that installs into `/usr/local/bin`
- `windows-latest` builds a branded installer `.exe` that installs into user profile and adds user PATH
- both artifacts are uploaded to the workflow run
- for matching tags, the workflow publishes them to a GitHub Release

## Suggested end-user installation model

After releases are published, users can install globally using installer artifacts:

- macOS: run `icuewidget-<version>-macos-installer.pkg`
- Windows: run `icuewidget-<version>-windows-installer.exe`

Fallback manual model (advanced users):

- download the standalone archive
- place binary on PATH manually

Future improvements can still add package-manager distribution:

- Homebrew formula/tap for macOS
- winget or Scoop manifest for Windows

## Signing and notarization

The workflow contains placeholder steps for:

- Windows Authenticode signing
- macOS Developer ID code signing
- macOS notarization

See `docs/CLI_Code_Signing_And_Notarization.md` for the operational plan and the secrets/tooling DevOps will need.
