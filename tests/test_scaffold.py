"""Tests for scaffold.py — scaffold_widget output structure."""
from __future__ import annotations

import json
from pathlib import Path

from icuewidget_cli.scaffold import scaffold_widget


def _make_manifest(widget_name: str = "TestWidget") -> dict:
    return {
        "author": "Test",
        "id": "com.test.widget",
        "name": widget_name,
        "description": "A test widget",
        "version": "1.0.0",
        "preview_icon": "resources/icon.svg",
        "min_framework_version": "1.0.0",
        "os": [{"platform": "windows"}],
        "supported_devices": [{"type": "dashboard_lcd"}],
    }


def test_scaffold_creates_expected_files(tmp_path: Path):
    manifest = _make_manifest()
    result = scaffold_widget(tmp_path, manifest, "TestWidget")

    expected_labels = {
        "manifest.json",
        "translation.json",
        "index.html",
        "resources/icon.svg",
        "styles/main.css",
    }
    actual_labels = {label for label, _ in result.files}
    assert actual_labels == expected_labels

    for _, file_path in result.files:
        assert file_path.exists(), f"Missing: {file_path}"


def test_scaffold_manifest_content(tmp_path: Path):
    manifest = _make_manifest("Hello")
    scaffold_widget(tmp_path, manifest, "Hello")

    written = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert written["name"] == "Hello"
    assert written["id"] == "com.test.widget"
    assert written["version"] == "1.0.0"
    assert written["os"] == [{"platform": "windows"}]
    assert written["supported_devices"] == [{"type": "dashboard_lcd"}]


def test_scaffold_index_html_contains_title(tmp_path: Path):
    scaffold_widget(tmp_path, _make_manifest("Demo"), "Demo")
    html = (tmp_path / "index.html").read_text(encoding="utf-8")
    assert "<title>" in html


def test_scaffold_creates_subdirectories(tmp_path: Path):
    target = tmp_path / "deep" / "nested"
    scaffold_widget(target, _make_manifest(), "TestWidget")
    assert (target / "resources").is_dir()
    assert (target / "styles").is_dir()


def test_scaffold_icon_svg_exists(tmp_path: Path):
    scaffold_widget(tmp_path, _make_manifest(), "TestWidget")
    svg = (tmp_path / "resources" / "icon.svg").read_text(encoding="utf-8")
    assert "<svg" in svg


def test_scaffold_result_target_dir(tmp_path: Path):
    result = scaffold_widget(tmp_path, _make_manifest(), "TestWidget")
    assert result.target_dir == tmp_path
