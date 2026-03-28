"""Tests for pure utility functions in cli.py."""
from __future__ import annotations

from pathlib import Path

from icuewidget_cli.cli import (
    build_default_widget_id,
    default_output_path,
    is_semver,
    slugify,
    validate_identifier,
)


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

