from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .templates import (
    build_default_icon_svg,
    build_index_html,
    build_starter_stylesheet,
    build_translation_json,
)


@dataclass
class ScaffoldResult:
    target_dir: Path
    files: list[tuple[str, Path]] = field(default_factory=list)


def scaffold_widget(
    target_dir: Path,
    manifest: dict[str, Any],
    widget_name: str,
) -> ScaffoldResult:
    """Write all scaffold files into *target_dir* and return a summary."""
    result = ScaffoldResult(target_dir=target_dir)

    resources_dir = target_dir / "resources"
    resources_dir.mkdir(parents=True, exist_ok=True)

    styles_dir = target_dir / "styles"
    styles_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = target_dir / "manifest.json"
    _write_json(manifest_path, manifest)
    result.files.append(("manifest.json", manifest_path))

    translation_path = target_dir / "translation.json"
    _write_text(translation_path, build_translation_json(widget_name))
    result.files.append(("translation.json", translation_path))

    index_path = target_dir / "index.html"
    _write_text(index_path, build_index_html(widget_name))
    result.files.append(("index.html", index_path))

    icon_path = resources_dir / "icon.svg"
    _write_text(icon_path, build_default_icon_svg(widget_name))
    result.files.append(("resources/icon.svg", icon_path))

    css_path = styles_dir / "main.css"
    _write_text(css_path, build_starter_stylesheet())
    result.files.append(("styles/main.css", css_path))

    return result


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")

