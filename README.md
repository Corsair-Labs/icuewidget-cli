# icuewidget CLI

This repository contains the `icuewidget` command-line tool for creating, validating, updating, and packaging iCUE widgets.

The CLI uses:

- Node.js 18 or newer, so it runs through `npx` or a global npm install
- built-in Node APIs for prompts, validation, and `.icuewidget` packaging
- no runtime dependencies

## Commands

- `icuewidget init [path]` - Creates a new widget from the starter template.
- `icuewidget validate [path]` - Validates widget files and manifest requirements.
- `icuewidget update [path]` - Updates manifest requirements, bumps widget version, and regenerates the `.icuewidget` package.
- `icuewidget package [path]` - Validates widget and creates an `.icuewidget` package.
- `icuewidget --help`
- `icuewidget --version`

## Contents

```text
.github/workflows/
node-bin/
src-node/
test-node/
package-lock.json
package.json
```

## Install

Run without installing:

```bash
npx icuewidget-cli --help
npx icuewidget-cli init ./MyWidget
npx icuewidget-cli validate ./MyWidget
npx icuewidget-cli update ./MyWidget --min-app-version 5.45
npx icuewidget-cli package ./MyWidget
```

Or install globally:

```bash
npm install -g icuewidget-cli
icuewidget --help
```

## Run locally without publishing

```bash
npm install
npm link
icuewidget --help
```

Or run the local bin directly:

```bash
node node-bin/icuewidget.js --help
node node-bin/icuewidget.js init ./MyWidget
node node-bin/icuewidget.js validate ./MyWidget
node node-bin/icuewidget.js package ./MyWidget
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
- `scripts/main.js`

Examples:

```bash
icuewidget init ./HelloWidget
```


## Versioning

The CLI follows semantic versioning. The version lives only in `package.json`,
and `icuewidget --version` reads it from there.
