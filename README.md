# icuewidget CLI

This repository contains the `icuewidget` command-line tool for creating, validating, and packaging iCUE widgets.

## Commands

- `icuewidget initiate [path]`
- `icuewidget validate [path]`
- `icuewidget package [path]`
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
python3 -m icuewidget_cli initiate ./MyWidget
python3 -m icuewidget_cli validate ./MyWidget
python3 -m icuewidget_cli package ./MyWidget
```

## Starter templates

`icuewidget initiate` can scaffold multiple starter templates:

- `basic` — minimal hello-world widget
- `settings` — hello-world widget with a few configurable properties
- `plugin` — basic plugin-aware scaffold showing initialization flow

Examples:

```bash
icuewidget initiate ./HelloWidget --template basic
icuewidget initiate ./ConfigurableWidget --template settings
icuewidget initiate ./PluginWidget --template plugin
```

## Standalone releases

This repo includes release packaging for standalone macOS and Windows binaries.

See:

- `docs/CLI_Release_Packaging.md`
- `docs/CLI_Code_Signing_And_Notarization.md`
