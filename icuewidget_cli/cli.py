from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from . import __version__

APP_NAME = "icuewidget"
DEFAULT_FRAMEWORK_VERSION = "1.0.0"
ALLOWED_PLATFORMS = {"windows", "mac"}
ALLOWED_DEVICE_TYPES = {"dashboard_lcd", "pump_lcd", "keyboard_lcd"}
ALLOWED_TEMPLATES = {"basic", "settings", "plugin"}
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9.-]+$")
PROPERTY_NAME_RE = re.compile(r"[^a-z0-9]+")


class CliError(Exception):
    pass


@dataclass
class ValidationResult:
    manifest: dict[str, Any]
    warnings: list[str]


def print_header() -> None:
    print(f"{APP_NAME} {__version__}")
    print("iCUE widget packaging and scaffolding CLI")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=APP_NAME,
        description="Create, validate, and package iCUE widgets.",
    )
    parser.add_argument(
        "--version", action="store_true", help="Show the CLI version and exit"
    )

    subparsers = parser.add_subparsers(dest="command")

    validate_parser = subparsers.add_parser(
        "validate",
        help="Validate a widget directory",
        description="Validate a widget directory without generating a package.",
    )
    validate_parser.add_argument(
        "path",
        nargs="?",
        default=".",
        help="Path to the widget directory (default: current directory)",
    )

    package_parser = subparsers.add_parser(
        "package",
        help="Validate a widget and generate a .icuewidget package",
        description="Validate a widget directory and generate a .icuewidget archive.",
    )
    package_parser.add_argument(
        "path",
        nargs="?",
        default=".",
        help="Path to the widget directory (default: current directory)",
    )
    package_parser.add_argument(
        "-o",
        "--output",
        help="Output .icuewidget file path (default: sibling file named after manifest id)",
    )

    initiate_parser = subparsers.add_parser(
        "initiate",
        help="Interactively scaffold a new widget",
        description="Create a basic iCUE widget structure and interactively generate manifest.json.",
    )
    initiate_parser.add_argument(
        "path",
        nargs="?",
        default=".",
        help="Target directory for the widget scaffold (default: current directory)",
    )
    initiate_parser.add_argument(
        "--force",
        action="store_true",
        help="Allow scaffolding into a non-empty directory",
    )
    initiate_parser.add_argument(
        "--template",
        choices=sorted(ALLOWED_TEMPLATES),
        help="Starter template to scaffold (basic, settings, plugin)",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.version:
        print_header()
        return 0

    if args.command == "validate":
        return command_validate(args)

    if args.command == "package":
        return command_package(args)

    if args.command == "initiate":
        return command_initiate(args)

    parser.print_help()
    return 0


def command_validate(args: argparse.Namespace) -> int:
    widget_dir = resolve_widget_dir(args.path)
    result = run_validation(widget_dir)

    print_header()
    print()
    print("Validation passed")
    print(f"  Widget: {result.manifest['name']}")
    print(f"  Id: {result.manifest['id']}")
    print(f"  Version: {result.manifest['version']}")
    print(f"  Path: {widget_dir}")
    if result.warnings:
        print()
        print("Warnings:")
        for warning in result.warnings:
            print(f"  - {warning}")
    return 0


def command_package(args: argparse.Namespace) -> int:
    widget_dir = resolve_widget_dir(args.path)
    result = run_validation(widget_dir)

    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else default_output_path(widget_dir, result.manifest)
    )
    if output_path.suffix != ".icuewidget":
        output_path = output_path.with_suffix(".icuewidget")

    create_package(widget_dir, output_path)

    print_header()
    print()
    print("Package created successfully")
    print(f"  Widget: {result.manifest['name']}")
    print(f"  Source: {widget_dir}")
    print(f"  Output: {output_path}")
    if result.warnings:
        print()
        print("Warnings:")
        for warning in result.warnings:
            print(f"  - {warning}")
    return 0


def command_initiate(args: argparse.Namespace) -> int:
    target_dir = Path(args.path).expanduser().resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    if not args.force and any(target_dir.iterdir()):
        print(f"Error: target directory is not empty: {target_dir}", file=sys.stderr)
        print("Use --force to scaffold into a non-empty directory.", file=sys.stderr)
        return 1

    print_header()
    print()
    print("Interactive widget initialization")
    print("Press Enter to accept defaults shown in brackets.")
    print()

    directory_name = target_dir.name if target_dir.name else "my-widget"
    suggested_name = title_case_from_slug(directory_name)
    widget_name = prompt("Widget name", suggested_name)
    template = args.template or prompt_choice(
        "Starter template",
        ["basic", "settings", "plugin"],
        "basic",
    )
    slug = slugify(widget_name) or slugify(directory_name) or "mywidget"
    author = prompt("Author", "Your Name")
    reverse_domain = prompt("Reverse-domain prefix", "com.example")
    widget_id = prompt_validated(
        "Widget id",
        f"{reverse_domain}.{slug}",
        validate_identifier,
        "Use only letters, digits, dots, and hyphens.",
    )
    description = prompt("Description", f"A widget named {widget_name}")
    version = prompt_validated(
        "Version",
        "1.0.0",
        is_semver,
        "Use semantic version format like 1.0.0.",
    )
    min_framework_version = prompt_validated(
        "Minimum framework version",
        DEFAULT_FRAMEWORK_VERSION,
        is_semver,
        "Use semantic version format like 1.0.0.",
    )
    preview_icon = prompt("Preview icon path", "resources/icon.svg")
    platforms = prompt_choice_list("Platforms", ["windows", "mac"], ["windows", "mac"])
    devices = prompt_choice_list(
        "Supported devices",
        ["dashboard_lcd", "pump_lcd", "keyboard_lcd"],
        ["dashboard_lcd"],
    )
    interactive = prompt_yes_no("Interactive widget", False)
    touch_features = []
    if interactive and "dashboard_lcd" in devices:
        touch_features = prompt_choice_list(
            "Dashboard features",
            ["sensor-screen"],
            ["sensor-screen"],
        )
    required_plugins = prompt_csv_list(
        "Required plugins",
        [],
        "Comma-separated plugin ids, or leave blank for none.",
    )
    if template == "plugin" and not required_plugins:
        required_plugins = ["SensorsDataProvider"]
    modules = prompt_csv_list(
        "JavaScript modules",
        [],
        "Comma-separated module file paths relative to the widget root, or leave blank for none.",
    )
    create_translation = prompt_yes_no("Create translation.json", True)
    create_starter_stylesheet = prompt_yes_no("Create styles/main.css", True)

    supported_devices: list[dict[str, Any]] = []
    for device in devices:
        entry: dict[str, Any] = {"type": device}
        if device == "dashboard_lcd" and touch_features:
            entry["features"] = touch_features
        supported_devices.append(entry)

    manifest = {
        "author": author,
        "id": widget_id,
        "name": widget_name,
        "description": description,
        "version": version,
        "preview_icon": preview_icon,
        "min_framework_version": min_framework_version,
        "os": [{"platform": platform} for platform in platforms],
        "supported_devices": supported_devices,
    }
    if interactive:
        manifest["interactive"] = True
    if required_plugins:
        manifest["required_plugins"] = required_plugins
    if modules:
        manifest["modules"] = modules

    resources_dir = target_dir / "resources"
    resources_dir.mkdir(parents=True, exist_ok=True)

    write_json(target_dir / "manifest.json", manifest)
    if create_translation:
        write_text(target_dir / "translation.json", build_translation_json(widget_name))
    write_text(
        target_dir / "index.html",
        build_index_html(
            widget_name,
            template=template,
            use_translation=create_translation,
            stylesheet_path="styles/main.css" if create_starter_stylesheet else None,
        ),
    )
    write_text(resources_dir / "icon.svg", build_default_icon_svg(widget_name))

    if create_starter_stylesheet:
        styles_dir = target_dir / "styles"
        styles_dir.mkdir(parents=True, exist_ok=True)
        write_text(styles_dir / "main.css", build_starter_stylesheet())

    for module_path in modules:
        file_path = target_dir / module_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        write_text(file_path, build_starter_module(module_path))

    print()
    print("Widget scaffold created")
    print(f"  Directory: {target_dir}")
    print(f"  Template: {template}")
    print("  Files:")
    print("    - manifest.json")
    print("    - index.html")
    print("    - resources/icon.svg")
    if create_translation:
        print("    - translation.json")
    if create_starter_stylesheet:
        print("    - styles/main.css")
    for module_path in modules:
        print(f"    - {module_path}")
    print()
    print("Next steps:")
    print(f"  1. Edit {target_dir / 'index.html'}")
    print(f"  2. Customize {target_dir / 'resources' / 'icon.svg'}")
    print(f"  3. Run `{APP_NAME} validate {target_dir}`")
    print(f"  4. Run `{APP_NAME} package {target_dir}` when ready")
    return 0


def validate_widget(widget_dir: Path) -> ValidationResult:
    manifest_path = widget_dir / "manifest.json"
    index_path = widget_dir / "index.html"

    if not manifest_path.exists():
        raise CliError("Missing required file: manifest.json")
    if not index_path.exists():
        raise CliError("Missing required file: index.html")

    manifest = load_json(manifest_path, label="manifest.json")
    warnings: list[str] = []

    validate_required_string(manifest, "author")
    validate_required_string(manifest, "id")
    validate_required_string(manifest, "name")
    validate_required_string(manifest, "description")
    validate_required_string(manifest, "version")
    validate_required_string(manifest, "preview_icon")
    validate_required_string(manifest, "min_framework_version")

    if not IDENTIFIER_RE.fullmatch(manifest["id"]):
        raise CliError(
            "manifest.id must contain only letters, digits, dots, and hyphens"
        )
    validate_semver(manifest["version"], "manifest.version")
    validate_semver(manifest["min_framework_version"], "manifest.min_framework_version")

    preview_icon_path = widget_dir / manifest["preview_icon"]
    if not preview_icon_path.exists():
        raise CliError(f"preview_icon does not exist: {manifest['preview_icon']}")

    os_entries = manifest.get("os")
    if not isinstance(os_entries, list) or not os_entries:
        raise CliError("manifest.os must be a non-empty array")
    for index, entry in enumerate(os_entries, start=1):
        if not isinstance(entry, dict):
            raise CliError(f"manifest.os[{index}] must be an object")
        platform = entry.get("platform")
        if platform not in ALLOWED_PLATFORMS:
            raise CliError(
                f"manifest.os[{index}].platform must be one of: {', '.join(sorted(ALLOWED_PLATFORMS))}"
            )

    device_entries = manifest.get("supported_devices")
    if not isinstance(device_entries, list) or not device_entries:
        raise CliError("manifest.supported_devices must be a non-empty array")
    for index, entry in enumerate(device_entries, start=1):
        if not isinstance(entry, dict):
            raise CliError(f"manifest.supported_devices[{index}] must be an object")
        device_type = entry.get("type")
        if device_type not in ALLOWED_DEVICE_TYPES:
            raise CliError(
                f"manifest.supported_devices[{index}].type must be one of: {', '.join(sorted(ALLOWED_DEVICE_TYPES))}"
            )
        features = entry.get("features")
        if features is not None:
            if not isinstance(features, list) or not all(
                isinstance(item, str) and item for item in features
            ):
                raise CliError(
                    f"manifest.supported_devices[{index}].features must be an array of strings"
                )

    interactive = manifest.get("interactive")
    if interactive is not None and not isinstance(interactive, bool):
        raise CliError("manifest.interactive must be a boolean when provided")
    if interactive and not any(
        device.get("type") == "dashboard_lcd" for device in device_entries
    ):
        warnings.append(
            "manifest.interactive is true, but dashboard_lcd is not listed in supported_devices"
        )

    required_plugins = manifest.get("required_plugins")
    if required_plugins is not None:
        if not isinstance(required_plugins, list) or not all(
            isinstance(item, str) and item.strip() for item in required_plugins
        ):
            raise CliError(
                "manifest.required_plugins must be an array of non-empty strings"
            )

    modules = manifest.get("modules")
    if modules is not None:
        if not isinstance(modules, list) or not all(
            isinstance(item, str) and item.strip() for item in modules
        ):
            raise CliError("manifest.modules must be an array of non-empty strings")
        for module_path in modules:
            if not (widget_dir / module_path).exists():
                raise CliError(
                    f"manifest.modules references a missing file: {module_path}"
                )

    translation_path = widget_dir / "translation.json"
    if translation_path.exists():
        load_json(translation_path, label="translation.json")

    index_html = index_path.read_text(encoding="utf-8")
    if "<title>" not in index_html:
        raise CliError("index.html must contain a <title> tag")
    if 'rel="icon"' not in index_html and "rel='icon'" not in index_html:
        warnings.append('index.html does not appear to contain a <link rel="icon"> tag')
    if "icueEvents" not in index_html:
        warnings.append("index.html does not declare icueEvents")

    return ValidationResult(manifest=manifest, warnings=warnings)


def create_package(widget_dir: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in sorted(widget_dir.rglob("*")):
            if not file_path.is_file():
                continue
            if should_skip_file(file_path, output_path):
                continue
            archive.write(file_path, file_path.relative_to(widget_dir))


def should_skip_file(file_path: Path, output_path: Path) -> bool:
    if file_path.resolve() == output_path.resolve():
        return True
    if any(part.startswith(".") for part in file_path.parts):
        return True
    if file_path.name.endswith(".icuewidget"):
        return True
    if file_path.name == "__pycache__":
        return True
    return False


def default_output_path(widget_dir: Path, manifest: dict[str, Any]) -> Path:
    package_name = manifest["id"]
    return widget_dir.parent / f"{package_name}.icuewidget"


def resolve_widget_dir(path_value: str) -> Path:
    widget_dir = Path(path_value).expanduser().resolve()
    if not widget_dir.exists() or not widget_dir.is_dir():
        raise SystemExit(f"Error: widget directory not found: {widget_dir}")
    return widget_dir


def run_validation(widget_dir: Path) -> ValidationResult:
    try:
        return validate_widget(widget_dir)
    except CliError as exc:
        print(f"Validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


def load_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        content = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CliError(f"{label} is not valid JSON: {exc}") from exc
    if not isinstance(content, dict):
        raise CliError(f"{label} must contain a JSON object at the top level")
    return content


def validate_required_string(manifest: dict[str, Any], key: str) -> None:
    value = manifest.get(key)
    if not isinstance(value, str) or not value.strip():
        raise CliError(f"manifest.{key} must be a non-empty string")


def validate_semver(value: str, label: str) -> None:
    if not SEMVER_RE.fullmatch(value):
        raise CliError(f"{label} must use semantic version format (for example 1.0.0)")


def is_semver(value: str) -> bool:
    return bool(SEMVER_RE.fullmatch(value))


def validate_identifier(value: str) -> bool:
    return bool(IDENTIFIER_RE.fullmatch(value))


def prompt(label: str, default: str) -> str:
    raw = input(f"{label} [{default}]: ").strip()
    return raw or default


def prompt_validated(
    label: str,
    default: str,
    validator: Callable[[str], bool],
    error_message: str,
) -> str:
    value = prompt(label, default)
    if validator(value):
        return value
    print(error_message)
    return prompt_validated(label, default, validator, error_message)


def prompt_yes_no(label: str, default: bool) -> bool:
    suffix = "Y/n" if default else "y/N"
    raw = input(f"{label} [{suffix}]: ").strip().lower()
    if not raw:
        return default
    if raw in {"y", "yes"}:
        return True
    if raw in {"n", "no"}:
        return False
    print("Please answer yes or no.")
    return prompt_yes_no(label, default)


def prompt_choice_list(label: str, allowed: list[str], default: list[str]) -> list[str]:
    prompt_text = ",".join(default)
    raw = input(f"{label} [{prompt_text}]: ").strip()
    chosen = [
        item.strip() for item in (raw.split(",") if raw else default) if item.strip()
    ]
    invalid = [item for item in chosen if item not in allowed]
    if invalid:
        print(f"Invalid values: {', '.join(invalid)}")
        print(f"Allowed values: {', '.join(allowed)}")
        return prompt_choice_list(label, allowed, default)
    if not chosen:
        print("At least one value is required.")
        return prompt_choice_list(label, allowed, default)
    return chosen


def prompt_choice(label: str, allowed: list[str], default: str) -> str:
    raw = input(f"{label} [{default}]: ").strip()
    choice = raw or default
    if choice not in allowed:
        print(f"Invalid value: {choice}")
        print(f"Allowed values: {', '.join(allowed)}")
        return prompt_choice(label, allowed, default)
    return choice


def prompt_csv_list(
    label: str, default: list[str], helper_text: str | None = None
) -> list[str]:
    default_text = ",".join(default)
    if helper_text:
        print(helper_text)
    raw = input(f"{label} [{default_text}]: ").strip()
    values = [
        item.strip() for item in (raw.split(",") if raw else default) if item.strip()
    ]
    deduped: list[str] = []
    for value in values:
        if value not in deduped:
            deduped.append(value)
    return deduped


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def slugify(value: str) -> str:
    normalized = PROPERTY_NAME_RE.sub("-", value.lower()).strip("-")
    return normalized.replace("-", "")


def title_case_from_slug(value: str) -> str:
    parts = re.split(r"[-_\s]+", value)
    return " ".join(part.capitalize() for part in parts if part) or "My Widget"


def build_translation_json(widget_name: str) -> str:
    payload = {
        widget_name: widget_name,
        "Settings": "Settings",
        "Text Color": "Text Color",
        "Hello World": "Hello World",
        "Headline": "Headline",
        "Show Subtitle": "Show Subtitle",
        "Subtitle": "Subtitle",
        "Waiting for Plugin": "Waiting for Plugin",
        "Plugin Example": "Plugin Example",
        "No Data Yet": "No Data Yet",
    }
    return json.dumps(payload, indent=2) + "\n"


def build_index_html(
    widget_name: str,
    *,
    template: str,
    use_translation: bool,
    stylesheet_path: str | None,
) -> str:
    if template == "settings":
        return build_settings_template(widget_name, use_translation, stylesheet_path)
    if template == "plugin":
        return build_plugin_template(widget_name, use_translation, stylesheet_path)

    return build_basic_template(widget_name, use_translation, stylesheet_path)


def build_basic_template(
    widget_name: str,
    use_translation: bool,
    stylesheet_path: str | None,
) -> str:
    title = (
        f"tr('{escape_single_quotes(widget_name)}')" if use_translation else widget_name
    )
    label = "tr('Text Color')" if use_translation else "Text Color"
    group_title = "tr('Settings')" if use_translation else "Settings"
    stylesheet = (
        f'  <link rel="stylesheet" href="{stylesheet_path}">\n'
        if stylesheet_path
        else ""
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <link rel="icon" type="image/svg+xml" href="resources/icon.svg">
{stylesheet}
  <meta name="x-icue-property" content="textColor"
        data-label="{label}"
        data-type="color"
        data-default="'#FFFFFF'">

  <script type="application/json" id="x-icue-groups">
  [{{"title": "{group_title}", "properties": ["textColor"]}}]
  </script>
</head>
<body>
  <div id="content">Hello World</div>

  <script>
    icueEvents = {{
      "onICUEInitialized": init,
      "onDataUpdated": update
    }};

    function init() {{
      update();
    }}

    function update() {{
      const color = typeof textColor !== 'undefined' ? textColor : '#FFFFFF';
      document.getElementById('content').style.color = color;
    }}

    if (typeof iCUE_initialized !== 'undefined' && iCUE_initialized) {{
      init();
    }}
  </script>
</body>
</html>
"""


def build_settings_template(
    widget_name: str,
    use_translation: bool,
    stylesheet_path: str | None,
) -> str:
    title = (
        f"tr('{escape_single_quotes(widget_name)}')" if use_translation else widget_name
    )
    settings_title = "tr('Settings')" if use_translation else "Settings"
    headline_label = "tr('Headline')" if use_translation else "Headline"
    subtitle_toggle = "tr('Show Subtitle')" if use_translation else "Show Subtitle"
    subtitle_label = "tr('Subtitle')" if use_translation else "Subtitle"
    stylesheet = (
        f'  <link rel="stylesheet" href="{stylesheet_path}">\n'
        if stylesheet_path
        else ""
    )
    headline_default = (
        f"tr('{escape_single_quotes(widget_name)}')" if use_translation else widget_name
    )
    subtitle_default = "tr('Hello World')" if use_translation else "Hello World"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <link rel="icon" type="image/svg+xml" href="resources/icon.svg">
{stylesheet}
  <meta name="x-icue-property" content="headline"
        data-label="{headline_label}"
        data-type="textfield"
        data-default="{headline_default}">

  <meta name="x-icue-property" content="showSubtitle"
        data-label="{subtitle_toggle}"
        data-type="switch"
        data-default="true">

  <meta name="x-icue-property" content="subtitle"
        data-label="{subtitle_label}"
        data-type="textfield"
        data-default="{subtitle_default}">

  <meta name="x-icue-property" content="textColor"
        data-label="{"tr('Text Color')" if use_translation else "Text Color"}"
        data-type="color"
        data-default="'#FFFFFF'">

  <script type="application/json" id="x-icue-groups">
  [{{"title": "{settings_title}", "properties": ["headline", "showSubtitle", "subtitle", "textColor"]}}]
  </script>
</head>
<body>
  <div id="content">
    <div id="headline">{widget_name}</div>
    <div id="subtitle">Hello World</div>
  </div>

  <script>
    icueEvents = {{
      "onICUEInitialized": init,
      "onDataUpdated": update
    }};

    function init() {{
      update();
    }}

    function update() {{
      const color = typeof textColor !== 'undefined' ? textColor : '#FFFFFF';
      const currentHeadline = typeof headline !== 'undefined' ? headline : '{escape_single_quotes(widget_name)}';
      const currentSubtitle = typeof subtitle !== 'undefined' ? subtitle : 'Hello World';
      const currentShowSubtitle = typeof showSubtitle !== 'undefined' ? showSubtitle : true;

      document.getElementById('headline').textContent = currentHeadline;
      document.getElementById('subtitle').textContent = currentSubtitle;
      document.getElementById('subtitle').style.display = currentShowSubtitle ? 'block' : 'none';
      document.getElementById('content').style.color = color;
    }}

    if (typeof iCUE_initialized !== 'undefined' && iCUE_initialized) {{
      init();
    }}
  </script>
</body>
</html>
"""


def build_plugin_template(
    widget_name: str,
    use_translation: bool,
    stylesheet_path: str | None,
) -> str:
    title = (
        f"tr('{escape_single_quotes(widget_name)}')" if use_translation else widget_name
    )
    settings_title = "tr('Settings')" if use_translation else "Settings"
    stylesheet = (
        f'  <link rel="stylesheet" href="{stylesheet_path}">\n'
        if stylesheet_path
        else ""
    )
    waiting_text = (
        "tr('Waiting for Plugin')" if use_translation else "Waiting for Plugin"
    )
    no_data_text = "tr('No Data Yet')" if use_translation else "No Data Yet"
    plugin_title = "tr('Plugin Example')" if use_translation else "Plugin Example"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <link rel="icon" type="image/svg+xml" href="resources/icon.svg">
{stylesheet}
  <meta name="x-icue-property" content="textColor"
        data-label="{"tr('Text Color')" if use_translation else "Text Color"}"
        data-type="color"
        data-default="'#FFFFFF'">

  <script type="application/json" id="x-icue-groups">
  [{{"title": "{settings_title}", "properties": ["textColor"]}}]
  </script>
</head>
<body>
  <div id="content">
    <div id="headline">{plugin_title}</div>
    <div id="status">{waiting_text}</div>
    <div id="value">{no_data_text}</div>
  </div>

  <script>
    let pluginReady = false;

    icueEvents = {{
      "onICUEInitialized": init,
      "onDataUpdated": update
    }};

    function init() {{
      bindPlugin();
      update();
    }}

    function bindPlugin() {{
      const sensorsPlugin = window.plugins && window.plugins.SensorsDataProvider;
      if (!sensorsPlugin) {{
        setStatus('{escape_single_quotes(waiting_text)}');
        return;
      }}

      pluginReady = true;
      setStatus('Plugin connected');
    }}

    function update() {{
      const color = typeof textColor !== 'undefined' ? textColor : '#FFFFFF';
      document.getElementById('content').style.color = color;
      if (!pluginReady) {{
        document.getElementById('value').textContent = '{escape_single_quotes(no_data_text)}';
      }}
    }}

    function setStatus(message) {{
      document.getElementById('status').textContent = message;
    }}

    if (typeof iCUE_initialized !== 'undefined' && iCUE_initialized) {{
      init();
    }}
  </script>
</body>
</html>
"""


def build_starter_stylesheet() -> str:
    return """:root { color-scheme: dark; }
html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  background: #000;
  font-family: Arial, sans-serif;
}

body {
  display: grid;
  place-items: center;
}

#content {
  color: #FFFFFF;
  font-size: 32px;
  text-align: center;
}
"""


def build_starter_module(module_path: str) -> str:
    module_name = Path(module_path).stem
    export_name = re.sub(r"[^A-Za-z0-9_]", "_", module_name) or "widgetModule"
    return f"""export function {export_name}() {{
  return '{module_name}';
}}
"""


def build_default_icon_svg(widget_name: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <rect x="8" y="8" width="112" height="112" rx="24" stroke="#FFFFFF" stroke-width="10"/>
  <path d="M34 36h14l16 45 16-45h14L82 94H68L34 36Z" fill="#FFFFFF"/>
  <title>{escape_xml(widget_name)} icon</title>
</svg>
"""


def escape_single_quotes(value: str) -> str:
    return value.replace("'", "\\'")


def escape_xml(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )
