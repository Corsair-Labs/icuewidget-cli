"""Tests for validation.py — path traversal, symlinks, and _should_skip_file."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from icuewidget_cli.validation import (
    CliError,
    _should_skip_file,
    validate_widget,
)


# ---------- _should_skip_file ----------

def test_skip_output_file(tmp_path: Path):
    f = tmp_path / "widget.icuewidget"
    f.touch()
    assert _should_skip_file(f, f, tmp_path) is True


def test_skip_hidden_file(tmp_path: Path):
    hidden = tmp_path / ".git" / "config"
    hidden.parent.mkdir()
    hidden.touch()
    assert _should_skip_file(hidden, tmp_path / "out.icuewidget", tmp_path) is True


def test_skip_pycache(tmp_path: Path):
    cache = tmp_path / "__pycache__" / "mod.pyc"
    cache.parent.mkdir()
    cache.touch()
    assert _should_skip_file(cache, tmp_path / "out.icuewidget", tmp_path) is True


def test_skip_icuewidget_extension(tmp_path: Path):
    f = tmp_path / "other.icuewidget"
    f.touch()
    assert _should_skip_file(f, tmp_path / "out.icuewidget", tmp_path) is True


def test_do_not_skip_normal_file(tmp_path: Path):
    f = tmp_path / "index.html"
    f.touch()
    assert _should_skip_file(f, tmp_path / "out.icuewidget", tmp_path) is False


def test_skip_file_outside_widget_root(tmp_path: Path):
    """A resolved path that escapes widget_root should be skipped."""
    outside = tmp_path / "outside.txt"
    outside.touch()
    widget_root = tmp_path / "widget"
    widget_root.mkdir()
    # The file is not inside widget_root
    assert _should_skip_file(outside, tmp_path / "out.icuewidget", widget_root) is True


# ---------- validate_widget helpers ----------

def _make_valid_widget(widget_dir: Path) -> None:
    """Create minimum valid widget files in widget_dir."""
    widget_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "author": "Test",
        "id": "com.test.widget",
        "name": "TestWidget",
        "description": "A test widget",
        "version": "1.0.0",
        "preview_icon": "resources/icon.svg",
        "min_framework_version": "1.0.0",
        "os": [{"platform": "windows"}],
        "supported_devices": [{"type": "dashboard_lcd"}],
    }
    (widget_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (widget_dir / "translation.json").write_text("{}", encoding="utf-8")
    resources = widget_dir / "resources"
    resources.mkdir()
    (resources / "icon.svg").write_text("<svg/>", encoding="utf-8")
    index = (
        '<html><head><title>Test</title>'
        '<link rel="icon" href="resources/icon.svg"></head>'
        "<body><script>var icueEvents=[];</script></body></html>"
    )
    (widget_dir / "index.html").write_text(index, encoding="utf-8")


# ---------- validate_widget — path traversal ----------

def test_validate_rejects_preview_icon_traversal(tmp_path: Path):
    _make_valid_widget(tmp_path / "widget")
    manifest_path = tmp_path / "widget" / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["preview_icon"] = "../secret.txt"
    manifest_path.write_text(json.dumps(manifest))
    (tmp_path / "secret.txt").touch()

    with pytest.raises(CliError, match="preview_icon must be inside"):
        validate_widget(tmp_path / "widget")


def test_validate_rejects_modules_traversal(tmp_path: Path):
    _make_valid_widget(tmp_path / "widget")
    manifest_path = tmp_path / "widget" / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["modules"] = ["../escape.js"]
    manifest_path.write_text(json.dumps(manifest))
    (tmp_path / "escape.js").touch()

    with pytest.raises(CliError, match="modules path escapes"):
        validate_widget(tmp_path / "widget")


# ---------- validate_widget — symlinks ----------

def test_validate_warns_on_internal_symlink(tmp_path: Path):
    _make_valid_widget(tmp_path / "widget")
    target = tmp_path / "widget" / "resources" / "icon.svg"
    link = tmp_path / "widget" / "link.txt"
    link.symlink_to(target)

    result = validate_widget(tmp_path / "widget")
    assert any("Symlink found" in w for w in result.warnings)


def test_validate_rejects_external_symlink(tmp_path: Path):
    _make_valid_widget(tmp_path / "widget")
    external = tmp_path / "external.txt"
    external.write_text("secret")
    link = tmp_path / "widget" / "escape_link"
    link.symlink_to(external)

    with pytest.raises(CliError, match="Symlink escapes"):
        validate_widget(tmp_path / "widget")


# ---------- validate_widget — happy path ----------

def test_validate_valid_widget(tmp_path: Path):
    _make_valid_widget(tmp_path / "widget")
    result = validate_widget(tmp_path / "widget")
    assert result.manifest["id"] == "com.test.widget"
    assert isinstance(result.warnings, list)

