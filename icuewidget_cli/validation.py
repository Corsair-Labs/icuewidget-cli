from __future__ import annotations

import json
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

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
    manifest_path = widget_dir / "manifest.json"
    index_path = widget_dir / "index.html"

    if not manifest_path.exists():
        raise CliError("Missing required file: manifest.json")
    if not index_path.exists():
        raise CliError("Missing required file: index.html")

    manifest = load_json(manifest_path, label="manifest.json")
    warnings: list[str] = []

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
    _validate_semver(manifest["min_framework_version"],
                     "manifest.min_framework_version")

    preview_icon_path = (widget_dir / manifest["preview_icon"]).resolve()
    if not preview_icon_path.is_relative_to(widget_dir.resolve()):
        raise CliError("preview_icon must be inside the widget directory")
    if not preview_icon_path.exists():
        raise CliError(
            f"preview_icon does not exist: {manifest['preview_icon']}")

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
            raise CliError(
                f"manifest.supported_devices[{index}] must be an object")
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
        or not all(isinstance(item, str) and item.strip()
                   for item in required_plugins)
    ):
        raise CliError(
            "manifest.required_plugins must be an array of non-empty strings"
        )

    modules = manifest.get("modules")
    if modules is not None:
        if not isinstance(modules, list) or not all(
            isinstance(item, str) and item.strip() for item in modules
        ):
            raise CliError(
                "manifest.modules must be an array of non-empty strings")
        for module_path in modules:
            resolved_module = (widget_dir / module_path).resolve()
            if not resolved_module.is_relative_to(widget_dir.resolve()):
                raise CliError(
                    f"manifest.modules path escapes widget directory: "
                    f"{module_path}"
                )
            if not resolved_module.exists():
                raise CliError(
                    f"manifest.modules references a missing file: "
                    f"{module_path}"
                )

    load_json(widget_dir / "translation.json", label="translation.json")

    index_html = index_path.read_text(encoding="utf-8")
    if "<title>" not in index_html:
        raise CliError("index.html must contain a <title> tag")
    if 'rel="icon"' not in index_html and "rel='icon'" not in index_html:
        warnings.append(
            'index.html does not appear to contain a <link rel="icon"> tag')
    if "icueEvents" not in index_html:
        warnings.append("index.html does not declare icueEvents")

    resolved_root = widget_dir.resolve()
    for child in widget_dir.rglob("*"):
        if child.is_symlink():
            target = child.resolve()
            if not target.is_relative_to(resolved_root):
                raise CliError(
                    f"Symlink escapes widget directory: "
                    f"{child.relative_to(widget_dir)} -> {target}"
                )
            warnings.append(
                f"Symlink found: {child.relative_to(widget_dir)}"
            )

    return ValidationResult(manifest=manifest, warnings=warnings)


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


def _should_skip_file(
    file_path: Path, output_path: Path, widget_root: Path
) -> bool:
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
        raise CliError(
            f"{label} must use semantic version format (for example 1.0.0)"
        )
