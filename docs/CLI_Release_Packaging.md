# CLI Release Packaging

This repository includes a release workflow for shipping standalone `icuewidget` binaries for macOS and Windows.

## What it does

- builds a one-file executable with PyInstaller
- produces a platform-specific release folder
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

Artifacts are written to:

- `release/icuewidget-<version>-macos/`
- `release/icuewidget-<version>-windows/`
- corresponding `.zip` archives in `release/`

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
- both artifacts are uploaded to the workflow run
- for matching tags, the workflow publishes them to a GitHub Release

## Suggested end-user installation model

After releases are published, users can:

- download the macOS archive and place `icuewidget` on their `PATH`
- download the Windows archive and place `icuewidget.exe` somewhere on their `PATH`

Future improvements can add:

- Homebrew distribution for macOS
- winget or Scoop distribution for Windows

## Signing and notarization

The workflow contains placeholder steps for:

- Windows Authenticode signing
- macOS Developer ID code signing
- macOS notarization

See `docs/CLI_Code_Signing_And_Notarization.md` for the operational plan and the secrets/tooling DevOps will need.
