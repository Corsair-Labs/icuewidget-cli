# icuewidget CLI

This repository contains the `icuewidget` command-line tool for creating, validating, updating, and packaging iCUE widgets.

The CLI uses:

- Node.js so it can run through `npx` without a native installer
- built-in Node APIs for prompts, validation, and `.icuewidget` packaging
- optional native installer builders for Windows `.exe` and macOS `.pkg`

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
installer/
node-bin/
scripts/
src-node/
test-node/
package-lock.json
package.json
```

## Run with npx

After publishing to npm:

```bash
npx @icue/icuewidget-cli --help
npx @icue/icuewidget-cli init ./MyWidget
npx @icue/icuewidget-cli validate ./MyWidget
npx @icue/icuewidget-cli update ./MyWidget --min-app-version 5.45
npx @icue/icuewidget-cli package ./MyWidget
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

The source package uses the base version `0.4.0`. Release automation can set the
third digit at build time with one of these environment variables:

```bash
CLI_BUILD_PATCH=123 npm run build
CLI_BUILD_VERSION=0.4.123 npm run build
```

`CLI_BUILD_PATCH`, `BUILD_NUMBER`, or `GITHUB_RUN_NUMBER` produces
`0.4.<patch>` for installer filenames and the bundled CLI `--version` output.

For npm publishing, publish a full semantic version, for example:

```bash
npm version 0.4.123
npm publish --access public
```

## npm publishing

Before publishing, verify the package contents and tests:

```bash
npm test
npm pack --dry-run
```

Then publish from this package directory:

```bash
npm publish --access public
```

Only the CLI runtime files listed in `package.json` are published to npm. The
installer assets and build scripts stay in the repository and are excluded from
the npm package.

## Native installers

The repository can also build native installers for users who do not want to use
`npx` or `npm install -g`.

Build standalone binaries first, then the platform installer:

```bash
npm run build
```

Outputs are written to:

```text
release/
```

Platform requirements:

- Windows `.exe`: build on Windows with NSIS `makensis` on `PATH`
- macOS `.pkg`: build on macOS with `pkgbuild` and `productbuild`

By default, installer builds package the checked-out local CLI source. To build
from a published npm package or tarball, set `CLI_PACKAGE_SPEC`:

```bash
CLI_PACKAGE_SPEC=@icue/icuewidget-cli@latest npm run build
CLI_PACKAGE_SPEC=./corsair-icuewidget-cli-1.0.0.tgz npm run build
```

The installers include best-effort cleanup for older Python-distributed versions
of `icuewidget-cli` before installing the standalone Node CLI binary.
