from __future__ import annotations

import json
import zipfile
from pathlib import Path

from typer.testing import CliRunner

from icuewidget_cli.cli import app


runner = CliRunner()


def _make_widget_missing_min_app_version(widget_dir: Path) -> None:
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
    (widget_dir / "index.html").write_text(
        "<html><head><title>Test</title>"
        '<link rel="icon" href="resources/icon.svg">'
        '<link rel="stylesheet" href="styles/main.css"></head>'
        '<body><script src="scripts/main.js"></script>'
        "<script>var icueEvents=[];</script></body></html>",
        encoding="utf-8",
    )
    styles = widget_dir / "styles"
    styles.mkdir()
    (styles / "main.css").write_text("body { color: red; }", encoding="utf-8")
    scripts = widget_dir / "scripts"
    scripts.mkdir()
    (scripts / "main.js").write_text("const value = 1;", encoding="utf-8")


def test_update_command_adds_min_app_version_and_regenerates_package(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_widget_missing_min_app_version(widget_dir)

    result = runner.invoke(
        app,
        ["update", str(widget_dir), "--min-app-version", "5.4.3"],
    )

    assert result.exit_code == 0, result.output
    manifest = json.loads((widget_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["min_app_version"] == "5.4.3"
    assert manifest["version"] == "1.0.1"

    package_path = tmp_path / "testwidget.icuewidget"
    assert package_path.exists()
    with zipfile.ZipFile(package_path) as archive:
        packaged_manifest = json.loads(archive.read("manifest.json"))
    assert packaged_manifest["min_app_version"] == "5.4.3"
    assert packaged_manifest["version"] == "1.0.1"


def test_update_command_uses_explicit_widget_version(tmp_path: Path):
    widget_dir = tmp_path / "widget"
    _make_widget_missing_min_app_version(widget_dir)

    result = runner.invoke(
        app,
        [
            "update",
            str(widget_dir),
            "--min-app-version",
            "5.4.3",
            "--version",
            "2.0.0",
        ],
    )

    assert result.exit_code == 0, result.output
    manifest = json.loads((widget_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["min_app_version"] == "5.4.3"
    assert manifest["version"] == "2.0.0"
