"""Tests for validation.py — path traversal, symlinks, and _should_skip_file."""

from __future__ import annotations

import json
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
        "min_app_version": "5.45",
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
        "<html><head><title>Test</title>"
        '<link rel="icon" href="resources/icon.svg">'
        '<link rel="stylesheet" href="styles/main.css"></head>'
        '<body><script src="scripts/main.js"></script><script>var icueEvents=[];</script></body></html>'
    )
    (widget_dir / "index.html").write_text(index, encoding="utf-8")
    styles = widget_dir / "styles"
    styles.mkdir()
    (styles / "main.css").write_text("body { color: red; }", encoding="utf-8")
    scripts = widget_dir / "scripts"
    scripts.mkdir()
    (scripts / "main.js").write_text("const value = 1;", encoding="utf-8")


def _set_manifest_required_plugins(widget_dir: Path, plugins: list[str]) -> None:
    manifest_path = widget_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["required_plugins"] = plugins
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")


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


def test_validate_rejects_missing_stylesheet_reference(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)
    (widget_dir / "styles" / "main.css").unlink()

    with pytest.raises(CliError, match="references a missing stylesheet"):
        validate_widget(widget_dir)


def test_validate_rejects_script_and_stylesheet_outside_widget_directory(
    tmp_path: Path,
):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)

    (widget_dir / "index.html").write_text(
        "<html><head><title>Test</title>"
        '<link rel="icon" href="resources/icon.svg">'
        '<link rel="stylesheet" href="../common/tools/media_viewer/MediaViewer.css"></head>'
        '<body><script src="../common/tools/media_viewer/MediaViewer.js"></script>'
        "<script>var icueEvents=[];</script></body></html>",
        encoding="utf-8",
    )

    with pytest.raises(CliError, match="outside the widget directory"):
        validate_widget(widget_dir)


def test_validate_accepts_local_common_assets_inside_widget(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)

    media_viewer_dir = widget_dir / "common" / "tools" / "media_viewer"
    media_viewer_dir.mkdir(parents=True)
    (media_viewer_dir / "MediaViewer.css").write_text(
        ".media-viewer { color: red; }", encoding="utf-8"
    )
    (media_viewer_dir / "MediaViewer.js").write_text(
        "const mediaViewerEnabled = true;", encoding="utf-8"
    )

    (widget_dir / "index.html").write_text(
        "<html><head><title>Test</title>"
        '<link rel="icon" href="resources/icon.svg">'
        '<link rel="stylesheet" href="common/tools/media_viewer/MediaViewer.css"></head>'
        '<body><script src="common/tools/media_viewer/MediaViewer.js"></script>'
        "<script>var icueEvents=[];</script></body></html>",
        encoding="utf-8",
    )

    result = validate_widget(widget_dir)
    assert result.manifest["id"] == "com.test.widget"


def test_validate_rejects_invalid_css_syntax(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)
    (widget_dir / "styles" / "main.css").write_text(
        "body { color: red;", encoding="utf-8"
    )

    with pytest.raises(CliError, match="CSS syntax error in main.css"):
        validate_widget(widget_dir)


def test_validate_rejects_missing_script_reference(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)
    (widget_dir / "scripts" / "main.js").unlink()

    with pytest.raises(CliError, match="references a missing script"):
        validate_widget(widget_dir)


def test_validate_rejects_invalid_js_syntax(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)
    (widget_dir / "scripts" / "main.js").write_text("const = ;", encoding="utf-8")

    with pytest.raises(CliError, match="JavaScript syntax error in main.js"):
        validate_widget(widget_dir)


def test_validate_rejects_remote_assets(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)
    (widget_dir / "index.html").write_text(
        "<html><head><title>Test</title>"
        '<link rel="icon" href="resources/icon.svg">'
        '<link rel="stylesheet" href="https://cdn.example.com/main.css"></head>'
        '<body><script src="https://cdn.example.com/main.js"></script>'
        "<script>var icueEvents=[];</script></body></html>",
        encoding="utf-8",
    )

    with pytest.raises(CliError, match="external stylesheet"):
        validate_widget(widget_dir)


def test_validate_rejects_sensors_plugin_without_wrapper_or_plugin_usage(
    tmp_path: Path,
):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)
    _set_manifest_required_plugins(
        widget_dir,
        ["widgetbuilder.sensorsdataprovider:Sensors:1.0"],
    )

    with pytest.raises(
        CliError,
        match="manifest.required_plugins includes 'widgetbuilder.sensorsdataprovider:Sensors:1.0'",
    ):
        validate_widget(widget_dir)


def test_validate_accepts_sensors_plugin_with_local_wrapper_files(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)
    _set_manifest_required_plugins(
        widget_dir,
        ["widgetbuilder.sensorsdataprovider:Sensors:1.0"],
    )

    plugin_dir = widget_dir / "common" / "plugins"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "IcueWidgetApiWrapper.js").write_text(
        "class IcueWidgetApiWrapper {}", encoding="utf-8"
    )
    (plugin_dir / "SimpleSensorApiWrapper.js").write_text(
        "class SimpleSensorApiWrapper extends IcueWidgetApiWrapper {}",
        encoding="utf-8",
    )

    (widget_dir / "index.html").write_text(
        "<html><head><title>Test</title>"
        '<link rel="icon" href="resources/icon.svg">'
        '<link rel="stylesheet" href="styles/main.css"></head>'
        '<body><script src="common/plugins/IcueWidgetApiWrapper.js"></script>'
        '<script src="common/plugins/SimpleSensorApiWrapper.js"></script>'
        "<script>var icueEvents=[];</script></body></html>",
        encoding="utf-8",
    )

    result = validate_widget(widget_dir)
    assert result.manifest["id"] == "com.test.widget"


def test_validate_accepts_media_plugin_with_inline_wrapper_classes(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)
    _set_manifest_required_plugins(
        widget_dir,
        ["widgetbuilder.mediadataprovider:Media:1.0"],
    )

    (widget_dir / "index.html").write_text(
        "<html><head><title>Test</title>"
        '<link rel="icon" href="resources/icon.svg">'
        '<link rel="stylesheet" href="styles/main.css"></head>'
        "<body><script>"
        "class IcueWidgetApiWrapper {}"
        "class SimpleMediaApiWrapper extends IcueWidgetApiWrapper {}"
        "var icueEvents=[];"
        "</script></body></html>",
        encoding="utf-8",
    )

    result = validate_widget(widget_dir)
    assert result.manifest["name"] == "TestWidget"


def test_validate_rejects_link_plugin_without_linkprovider_usage(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)
    _set_manifest_required_plugins(
        widget_dir,
        ["widgetbuilder.linkprovider:Url:1.0"],
    )

    with pytest.raises(
        CliError,
        match="does not appear to reference Linkprovider usage",
    ):
        validate_widget(widget_dir)


def test_validate_accepts_link_plugin_with_direct_usage_marker(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_valid_widget(widget_dir)
    _set_manifest_required_plugins(
        widget_dir,
        ["widgetbuilder.linkprovider:Url:1.0"],
    )

    (widget_dir / "index.html").write_text(
        "<html><head><title>Test</title>"
        '<link rel="icon" href="resources/icon.svg">'
        '<link rel="stylesheet" href="styles/main.css"></head>'
        "<body><script>"
        "if (window.plugins && window.plugins.Linkprovider && pluginLinkprovider_initialized) {"
        "window.plugins.Linkprovider.open('https://example.com');"
        "}"
        "var icueEvents=[];"
        "</script></body></html>",
        encoding="utf-8",
    )

    result = validate_widget(widget_dir)
    assert result.manifest["name"] == "TestWidget"
