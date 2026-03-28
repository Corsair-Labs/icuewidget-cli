# icuewidget CLI

This repository contains the `icuewidget` command-line tool for creating, validating, and packaging iCUE widgets.

The CLI uses:

- `Typer` for command structure
- `Rich` for polished help and output
- `Questionary` for interactive scaffolding prompts

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

The same template list is shown in:

- `icuewidget initiate --help`
- the interactive `initiate` prompt

Interactive prompts use menu-based selection where appropriate instead of plain text entry.

Examples:

```bash
icuewidget initiate ./HelloWidget --template basic
icuewidget initiate ./ConfigurableWidget --template settings
icuewidget initiate ./PluginWidget --template plugin
```

## Widget id suggestion

During `initiate`, the CLI asks for an optional organization domain and uses it to suggest a reverse-domain style widget id.

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

## Standalone releases

This repo includes release packaging for standalone macOS and Windows binaries.

See:

- `docs/CLI_Release_Packaging.md`
- `docs/CLI_Code_Signing_And_Notarization.md`
