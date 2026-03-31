from __future__ import annotations

import json
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

import esprima
import tinycss2

from .constants import (
    ALLOWED_DEVICE_TYPES,
    ALLOWED_PLATFORMS,
    IDENTIFIER_RE,
    SEMVER_RE,
)


class CliError(Exception):
    pass


@dataclass
class ValidationResult:
    manifest: dict[str, Any]
    warnings: list[str]


def validate_widget(widget_dir: Path) -> ValidationResult:
    manifest_path, index_path = _validate_required_files(widget_dir)
    manifest = _validate_manifest(widget_dir, manifest_path)
    warnings: list[str] = []

    load_json(widget_dir / "translation.json", label="translation.json")
    _validate_index_html(widget_dir, index_path, warnings)
    _validate_symlinks(widget_dir, warnings)

    return ValidationResult(manifest=manifest, warnings=warnings)


def _validate_required_files(widget_dir: Path) -> tuple[Path, Path]:
    manifest_path = widget_dir / "manifest.json"
    index_path = widget_dir / "index.html"

    if not manifest_path.exists():
        raise CliError("Missing required file: manifest.json")
    if not index_path.exists():
        raise CliError("Missing required file: index.html")

    return manifest_path, index_path


def _validate_manifest(widget_dir: Path, manifest_path: Path) -> dict[str, Any]:
    manifest = load_json(manifest_path, label="manifest.json")

    for key in [
        "author",
        "id",
        "name",
        "description",
        "version",
        "preview_icon",
        "min_framework_version",
    ]:
        _validate_required_string(manifest, key)

    if not IDENTIFIER_RE.fullmatch(manifest["id"]):
        raise CliError(
            "manifest.id must contain only letters, digits, dots, and hyphens"
        )
    _validate_semver(manifest["version"], "manifest.version")
    _validate_semver(
        manifest["min_framework_version"], "manifest.min_framework_version"
    )

    preview_icon_path = (widget_dir / manifest["preview_icon"]).resolve()
    if not preview_icon_path.is_relative_to(widget_dir.resolve()):
        raise CliError("preview_icon must be inside the widget directory")
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
                f"manifest.os[{index}].platform must be one of: "
                f"{', '.join(sorted(ALLOWED_PLATFORMS))}"
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
                f"manifest.supported_devices[{index}].type must be one of: "
                f"{', '.join(sorted(ALLOWED_DEVICE_TYPES))}"
            )
        features = entry.get("features")
        if features is not None and (
            not isinstance(features, list)
            or not all(isinstance(item, str) and item for item in features)
        ):
            raise CliError(
                f"manifest.supported_devices[{index}].features must be an "
                f"array of strings"
            )

    interactive = manifest.get("interactive")
    if interactive is not None and not isinstance(interactive, bool):
        raise CliError("manifest.interactive must be a boolean when provided")

    required_plugins = manifest.get("required_plugins")
    if required_plugins is not None and (
        not isinstance(required_plugins, list)
        or not all(isinstance(item, str) and item.strip() for item in required_plugins)
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
            resolved_module = (widget_dir / module_path).resolve()
            if not resolved_module.is_relative_to(widget_dir.resolve()):
                raise CliError(
                    f"manifest.modules path escapes widget directory: {module_path}"
                )
            if not resolved_module.exists():
                raise CliError(
                    f"manifest.modules references a missing file: {module_path}"
                )

    return manifest


def _validate_index_html(
    widget_dir: Path, index_path: Path, warnings: list[str]
) -> None:
    index_html = index_path.read_text(encoding="utf-8")
    parser = WidgetHtmlParser()

    try:
        parser.feed(index_html)
        parser.close()
    except ValueError as exc:
        raise CliError(f"index.html is not valid HTML: {exc}") from exc

    if not parser.has_title:
        raise CliError("index.html must contain a <title> tag")
    if not parser.has_favicon:
        warnings.append('index.html does not appear to contain a <link rel="icon"> tag')
    if "icueEvents" not in index_html:
        warnings.append("index.html does not declare icueEvents")

    for asset in parser.stylesheets:
        css_path = _resolve_local_asset(widget_dir, asset, source_label="stylesheet")
        if css_path is not None:
            _validate_css_file(css_path)

    for asset in parser.scripts:
        js_path = _resolve_local_asset(widget_dir, asset, source_label="script")
        if js_path is not None:
            _validate_js_file(js_path)


def _validate_symlinks(widget_dir: Path, warnings: list[str]) -> None:
    resolved_root = widget_dir.resolve()
    for child in widget_dir.rglob("*"):
        if child.is_symlink():
            target = child.resolve()
            if not target.is_relative_to(resolved_root):
                raise CliError(
                    f"Symlink escapes widget directory: "
                    f"{child.relative_to(widget_dir)} -> {target}"
                )
            warnings.append(f"Symlink found: {child.relative_to(widget_dir)}")


def _resolve_local_asset(
    widget_dir: Path, asset_path: str, *, source_label: str
) -> Path | None:
    normalized_asset_path = asset_path.strip()
    if not normalized_asset_path or normalized_asset_path.startswith(
        ("http://", "https://", "//", "data:", "#")
    ):
        return None

    resolved_asset = (widget_dir / normalized_asset_path).resolve()
    widget_root = widget_dir.resolve()
    if not resolved_asset.is_relative_to(widget_root):
        raise CliError(
            f"index.html {source_label} path escapes widget directory: {asset_path}"
        )
    if not resolved_asset.exists() or not resolved_asset.is_file():
        raise CliError(f"index.html references a missing {source_label}: {asset_path}")
    return resolved_asset


def _validate_css_file(css_path: Path) -> None:
    css_text = css_path.read_text(encoding="utf-8")
    _validate_balanced_css_delimiters(css_text, css_path)

    stylesheet = tinycss2.parse_stylesheet(
        css_text,
        skip_comments=False,
        skip_whitespace=False,
    )
    parse_errors = [token for token in stylesheet if token.type == "error"]
    if parse_errors:
        first_error = parse_errors[0]
        raise CliError(f"CSS syntax error in {css_path.name}: {first_error.message}")


def _validate_js_file(js_path: Path) -> None:
    try:
        esprima.parseScript(js_path.read_text(encoding="utf-8"), tolerant=False)
    except esprima.Error as exc:
        raise CliError(f"JavaScript syntax error in {js_path.name}: {exc}") from exc


def _validate_balanced_css_delimiters(css_text: str, css_path: Path) -> None:
    stack: list[str] = []
    string_delimiter: str | None = None
    in_comment = False
    index = 0

    while index < len(css_text):
        char = css_text[index]
        next_char = css_text[index + 1] if index + 1 < len(css_text) else ""

        if in_comment:
            if char == "*" and next_char == "/":
                in_comment = False
                index += 2
                continue
            index += 1
            continue

        if string_delimiter is not None:
            if char == "\\":
                index += 2
                continue
            if char == string_delimiter:
                string_delimiter = None
            index += 1
            continue

        if char == "/" and next_char == "*":
            in_comment = True
            index += 2
            continue
        if char in {'"', "'"}:
            string_delimiter = char
            index += 1
            continue
        if char in "{([":
            stack.append(char)
        elif char in "})]":
            if not stack:
                raise CliError(
                    f"CSS syntax error in {css_path.name}: unexpected closing delimiter '{char}'"
                )
            opener = stack.pop()
            expected = {"{": "}", "(": ")", "[": "]"}[opener]
            if char != expected:
                raise CliError(
                    f"CSS syntax error in {css_path.name}: expected '{expected}' before '{char}'"
                )

        index += 1

    if string_delimiter is not None:
        raise CliError(
            f"CSS syntax error in {css_path.name}: unterminated string literal"
        )
    if in_comment:
        raise CliError(f"CSS syntax error in {css_path.name}: unterminated comment")
    if stack:
        expected = {"{": "}", "(": ")", "[": "]"}[stack[-1]]
        raise CliError(
            f"CSS syntax error in {css_path.name}: missing closing delimiter '{expected}'"
        )


class WidgetHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.has_title = False
        self._inside_title = False
        self.has_favicon = False
        self.stylesheets: list[str] = []
        self.scripts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key.lower(): value for key, value in attrs}

        if tag == "title":
            self._inside_title = True
        elif tag == "link":
            rel_value = (attributes.get("rel") or "").lower()
            href_value = attributes.get("href")
            rel_tokens = {token for token in rel_value.split() if token}
            if "icon" in rel_tokens:
                self.has_favicon = True
            if "stylesheet" in rel_tokens and href_value:
                self.stylesheets.append(href_value)
        elif tag == "script":
            src_value = attributes.get("src")
            if src_value:
                self.scripts.append(src_value)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._inside_title = False

    def handle_data(self, data: str) -> None:
        if self._inside_title and data.strip():
            self.has_title = True

    def error(self, message: str) -> None:
        raise ValueError(message)


def create_package(widget_dir: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    resolved_root = widget_dir.resolve()
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in sorted(widget_dir.rglob("*")):
            if not file_path.is_file():
                continue
            if _should_skip_file(file_path, output_path, resolved_root):
                continue
            archive.write(file_path, file_path.relative_to(widget_dir))


def _should_skip_file(file_path: Path, output_path: Path, widget_root: Path) -> bool:
    if file_path.resolve() == output_path.resolve():
        return True
    if not file_path.resolve().is_relative_to(widget_root):
        return True
    if any(part.startswith(".") for part in file_path.parts):
        return True
    if file_path.name.endswith(".icuewidget"):
        return True
    if "__pycache__" in file_path.parts:
        return True
    return False


def load_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        content = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CliError(f"{label} is not valid JSON: {exc}") from exc
    if not isinstance(content, dict):
        raise CliError(f"{label} must contain a JSON object at the top level")
    return content


def _validate_required_string(manifest: dict[str, Any], key: str) -> None:
    value = manifest.get(key)
    if not isinstance(value, str) or not value.strip():
        raise CliError(f"manifest.{key} must be a non-empty string")


def _validate_semver(value: str, label: str) -> None:
    if not SEMVER_RE.fullmatch(value):
        raise CliError(f"{label} must use semantic version format (for example 1.0.0)")
