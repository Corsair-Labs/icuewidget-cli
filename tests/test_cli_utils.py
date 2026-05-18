"""Tests for pure utility functions in cli.py."""
from __future__ import annotations

import json
from pathlib import Path

from icuewidget_cli.cli import (
    bump_patch_version,
    build_default_widget_id,
    default_output_path,
    is_semver,
    slugify,
    update_manifest_to_latest,
    validate_identifier,
)
from icuewidget_cli.version import read_base_version, resolve_version


# --- slugify ---

def test_slugify_lowercase():
    assert slugify("HelloWorld") == "helloworld"


def test_slugify_removes_spaces():
    assert slugify("My Widget") == "mywidget"


def test_slugify_removes_special_chars():
    assert slugify("hello@world#123") == "helloworld123"


def test_slugify_empty_string():
    assert slugify("") == ""


def test_slugify_all_special():
    assert slugify("@#$%") == ""


# --- build_default_widget_id ---

def test_build_default_widget_id_basic():
    assert build_default_widget_id("Acme", "mywidget") == "com.acme.mywidget"


def test_build_default_widget_id_empty_author():
    assert build_default_widget_id("", "mywidget") == "com.example.mywidget"


def test_build_default_widget_id_special_author():
    assert build_default_widget_id("@@@", "mywidget") == "com.example.mywidget"


def test_build_default_widget_id_spaces_in_author():
    assert build_default_widget_id("John Doe", "test") == "com.johndoe.test"


# --- default_output_path ---

def test_default_output_path_from_name(tmp_path: Path):
    widget_dir = tmp_path / "my_widget"
    widget_dir.mkdir()
    manifest = {"name": "Hello Widget", "id": "com.test.hello"}
    result = default_output_path(widget_dir, manifest)
    assert result == tmp_path / "hellowidget.icuewidget"


def test_default_output_path_fallback_to_id(tmp_path: Path):
    widget_dir = tmp_path / "my_widget"
    widget_dir.mkdir()
    manifest = {"name": "@@@", "id": "com.test.hello"}
    result = default_output_path(widget_dir, manifest)
    assert result == tmp_path / "comtesthello.icuewidget"


def test_default_output_path_fallback_to_widget(tmp_path: Path):
    widget_dir = tmp_path / "my_widget"
    widget_dir.mkdir()
    manifest = {"name": "@@@", "id": "@@@"}
    result = default_output_path(widget_dir, manifest)
    assert result == tmp_path / "widget.icuewidget"


# --- manifest update helpers ---

def test_update_manifest_to_latest_adds_missing_min_app_version(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    widget_dir.mkdir()
    manifest_path = widget_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps({"name": "Hello", "id": "com.test.hello", "version": "1.0.0"}),
        encoding="utf-8",
    )

    changes = update_manifest_to_latest(widget_dir, min_app_version="5.4.3")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert changes == ["manifest.version", "manifest.min_app_version"]
    assert manifest["min_app_version"] == "5.4.3"
    assert manifest["version"] == "1.0.1"


def test_update_manifest_to_latest_uses_explicit_version(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    widget_dir.mkdir()
    manifest_path = widget_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps({"name": "Hello", "id": "com.test.hello", "version": "1.0.0"}),
        encoding="utf-8",
    )

    changes = update_manifest_to_latest(
        widget_dir, min_app_version="5.4.3", widget_version="2.0.0"
    )

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert changes == ["manifest.version", "manifest.min_app_version"]
    assert manifest["min_app_version"] == "5.4.3"
    assert manifest["version"] == "2.0.0"


def test_update_manifest_to_latest_sets_explicit_version_only(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    widget_dir.mkdir()
    manifest_path = widget_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "name": "Hello",
                "id": "com.test.hello",
                "version": "1.0.0",
                "min_app_version": "5.1.0",
            }
        ),
        encoding="utf-8",
    )

    changes = update_manifest_to_latest(widget_dir, widget_version="1.2.0")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert changes == ["manifest.version"]
    assert manifest["version"] == "1.2.0"


def test_update_manifest_to_latest_keeps_valid_min_app_version(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    widget_dir.mkdir()
    manifest_path = widget_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "name": "Hello",
                "id": "com.test.hello",
                "min_app_version": "5.1.0",
            }
        ),
        encoding="utf-8",
    )

    changes = update_manifest_to_latest(widget_dir, min_app_version="5.4.3")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert changes == []
    assert manifest["min_app_version"] == "5.1.0"


def test_bump_patch_version():
    assert bump_patch_version("1.2.3") == "1.2.4"


# --- is_semver ---

def test_is_semver_valid():
    assert is_semver("1.0.0") is True
    assert is_semver("0.1.2") is True
    assert is_semver("10.20.30") is True


def test_is_semver_invalid():
    assert is_semver("1.0") is False
    assert is_semver("v1.0.0") is False
    assert is_semver("1.0.0-beta") is False
    assert is_semver("") is False


# --- validate_identifier ---

def test_validate_identifier_valid():
    assert validate_identifier("com.acme.widget") is True
    assert validate_identifier("my-widget-123") is True


def test_validate_identifier_invalid():
    assert validate_identifier("hello world") is False
    assert validate_identifier("widget@name") is False
    assert validate_identifier("") is False


# --- version resolution ---

def test_read_base_version_uses_jenkins_config(monkeypatch):
    monkeypatch.delenv("ICUEWIDGET_BASE_VERSION", raising=False)
    assert read_base_version() == "0.2"


def test_resolve_version_prefers_build_version(monkeypatch):
    monkeypatch.setattr("icuewidget_cli.version.read_stamped_version", lambda: None)
    monkeypatch.setenv("BUILD_VERSION", "0.2.11")
    monkeypatch.setenv("BUILD_NUMBER", "99")
    assert resolve_version() == "0.2.11"


def test_resolve_version_combines_base_and_build_number(monkeypatch):
    monkeypatch.setattr("icuewidget_cli.version.read_stamped_version", lambda: None)
    monkeypatch.delenv("BUILD_VERSION", raising=False)
    monkeypatch.setenv("ICUEWIDGET_BASE_VERSION", "0.3")
    monkeypatch.setenv("BUILD_NUMBER", "7")
    assert resolve_version() == "0.3.7"


def test_resolve_version_uses_zero_patch_for_local_builds(monkeypatch):
    monkeypatch.setattr("icuewidget_cli.version.read_stamped_version", lambda: None)
    monkeypatch.delenv("BUILD_VERSION", raising=False)
    monkeypatch.delenv("BUILD_NUMBER", raising=False)
    monkeypatch.setenv("ICUEWIDGET_BASE_VERSION", "0.3")
    assert resolve_version() == "0.3.0"


def test_resolve_version_prefers_stamped_build_version(monkeypatch):
    monkeypatch.setattr("icuewidget_cli.version.read_stamped_version", lambda: "0.2.11")
    monkeypatch.setenv("BUILD_VERSION", "0.2.12")
    assert resolve_version() == "0.2.11"
