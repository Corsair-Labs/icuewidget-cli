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


## Validation

`icuewidget validate` (and `package` / `update`, which validate first) checks the widget files, the manifest, and the `<head>` XML. Errors fail the command; warnings are printed but do not block packaging.

### Manifest permissions

The optional `manifest.permissions` array (see the iCUE widget docs, "Widget Permissions") is validated against the documented schema.

Errors (validation fails):

- `permissions` is not an array, an entry is not an object, or `type` is missing/unknown. Types: `file`, `folder`, `url`, `microphone`, `camera`, `speaker`, `screen`, `clipboard_read_write`, `local_fonts_access`, `self_signed_certificate`, `download`, `application`.
- `url`: missing/invalid `domain` (must be a bare hostname, IP, or `any` - no protocol, path, or `host:port`); `port` that is not an integer from 1 to 65535; `domain: "localhost"` without a `port`.
- `file` / `folder`: missing `path`; a path that is neither absolute nor starts with a `<Macro>`; `{Macro}` curly braces (those are only for File System Provider `watchPath()`); an unknown or malformed `<Macro>`. Macros: `Home`, `Desktop`, `Documents`, `Downloads`, `Music`, `Pictures`, `Movies`, `Temp`, `AppData`, `Runtime`.
- `self_signed_certificate`: missing or non-bare `host`. `application`: missing `application` name.
- **Undeclared literal access in code** (works even when the manifest has no `permissions` key): a `fetch` / `WebSocket` / `EventSource` / `XMLHttpRequest` / `sendBeacon` call to a literal host that no `url` permission covers (subdomains and ports are honored), or a `watchPath()` literal outside every `file` / `folder` permission. All findings are listed in one error with a suggested manifest entry. The scan reads `index.html`, local scripts, and `manifest.modules`, and skips bundled `common/` files.

Warnings:

- `url` with `domain: "any"` (all external hosts), loopback IP without a port, duplicate entries, undocumented fields, wrong-case macros, `..` path segments, a `file` path that ends in a separator, and applications other than Stream Deck.
- Plugin/permission mismatches: the Stream Deck plugin without `{ "type": "application", "application": "Stream Deck" }` (and the reverse), and the File System plugin without a `file` / `folder` permission.
- Pattern-based checks on the same files for `getUserMedia`, `getDisplayMedia`, `navigator.clipboard`, `queryLocalFonts`, audio playback, and downloads without the matching permission, plus network calls with a non-literal URL or `watchPath()` with a non-literal path when no `url` / `file` / `folder` permission exists at all. Dynamic URLs and paths cannot be resolved, so these stay warnings.

The code scan is text-based, so literal URLs in commented-out code are also reported; delete or declare them.

## Versioning

The CLI follows semantic versioning. The version lives only in `package.json`,
and `icuewidget --version` reads it from there.
