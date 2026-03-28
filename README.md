# icuewidget CLI

This repository contains the `icuewidget` command-line tool for creating, validating, and packaging iCUE widgets.

The CLI uses:

- `Typer` for command structure
- `Rich` for polished help and output
- `Questionary` for interactive scaffolding prompts

## Commands

- `icuewidget init [path]`
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
- optional `styles/main.css`

Examples:

```bash
icuewidget init ./HelloWidget
```

## Widget id suggestion

During `init`, the CLI asks for an optional organization domain and uses it to suggest a reverse-domain style widget id.

If you enter a domain like:

```text
domain.com
```

and the widget name slug is `test`, the default widget id becomes:

```text
com.domain.test
```

If you leave the domain blank, the CLI falls back to the author name. For example, author `Roman Gru` with widget slug `test` becomes:

```text
com.romangru.test
```

You can always replace the suggested widget id with your own stable identifier.

The `Widget name` and `Author` prompts do not have defaults and must be entered explicitly.

## Standalone releases

This repo includes release packaging for standalone macOS and Windows binaries.

See:

- `docs/CLI_Release_Packaging.md`
- `docs/CLI_Code_Signing_And_Notarization.md`
