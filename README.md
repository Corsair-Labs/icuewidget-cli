# icuewidget CLI

This repository contains the `icuewidget` command-line tool for creating, validating, and packaging iCUE widgets.

The CLI uses:

- `Typer` for command structure
- `Rich` for polished help and output
- `Questionary` for interactive scaffolding prompts

## Commands

- `icuewidget init [path]` - Creates a new widget from the starter template.
- `icuewidget validate [path]` - Validates widget files and manifest requirements.
- `icuewidget update [path]` - Updates manifest requirements, bumps widget version, and regenerates the `.icuewidget` package.
- `icuewidget package [path]` - Validates widget and creates an `.icuewidget` package.
- `icuewidget --help`
- `icuewidget --version`

## Contents

```text
icuewidget_cli/
bin/
.github/workflows/
docs/
pyproject.toml
build_standalone.py
```

## Install from source

```bash
pip install .
```

## Run locally without installing

```bash
python3 -m icuewidget_cli --help
python3 -m icuewidget_cli init ./MyWidget
python3 -m icuewidget_cli validate ./MyWidget
python3 -m icuewidget_cli package ./MyWidget
```

## Generated starter widget

`icuewidget init` always scaffolds a configurable hello-world widget for:

- `windows`
- `dashboard_lcd`

The generated widget includes example customizable properties such as:

- headline
- subtitle
- show/hide subtitle
- text color
- background color

The CLI always creates:

- `manifest.json`
- `index.html`
- `translation.json`
- `resources/icon.svg`
- `styles/main.css`

Examples:

```bash
icuewidget init ./HelloWidget
```


## Standalone releases

This repo includes release packaging for standalone macOS and Windows binaries.

For end-user-friendly global install artifacts, it also includes installer packaging:

- macOS: signed-friendly `.pkg` installer target (installs `icuewidget` to `/usr/local/bin`)
- Windows: branded CORSAIR installer `.exe` target (installs `icuewidget.exe` and adds it to user PATH)

Windows packaging uses official CORSAIR branding assets for both:

- `icuewidget.exe` icon
- installer/uninstaller icon and installer header/wizard artwork

Local maintainer workflow:

```bash
python build_standalone.py
python build_installers.py
```

See:

- `docs/CLI_Release_Packaging.md`
- `docs/CLI_Code_Signing_And_Notarization.md`
