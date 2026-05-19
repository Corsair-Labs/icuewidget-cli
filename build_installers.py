from __future__ import annotations

import platform
import shutil
import subprocess
from pathlib import Path
from xml.sax.saxutils import escape

from icuewidget_cli.version import resolve_version


ROOT = Path(__file__).resolve().parent
RELEASE_DIR = ROOT / "release"
BUILD_DIR = ROOT / "build"
WINDOWS_INSTALLER_SCRIPT = ROOT / "installer" / "windows" / "icuewidget-installer.nsi"
WINDOWS_INSTALLER_ASSETS_DIR = ROOT / "installer" / "windows" / "assets"
WINDOWS_STAGED_ASSETS_DIR = BUILD_DIR / "installer-windows-assets"
WINDOWS_SIDE_IMAGE = "InstallerSideImage.bmp"
WINDOWS_HEADER_IMAGE = "CORSAIRLogo2020_horiz_K.bmp"
MACOS_PACKAGE_IDENTIFIER = "com.corsair.icuewidget-cli"
MACOS_INSTALLER_RESOURCES_DIR = ROOT / "installer" / "macos" / "resources"
MACOS_STAGED_RESOURCES_DIR = BUILD_DIR / "installer-macos-resources"
MACOS_COMPONENT_PACKAGE = BUILD_DIR / "icuewidget-cli-component.pkg"
MACOS_DISTRIBUTION_XML = BUILD_DIR / "icuewidget-cli-distribution.xml"
CORSAIR_LOGO_SOURCE = WINDOWS_INSTALLER_ASSETS_DIR / "CORSAIRLogo2020_horiz_K.png"


def main() -> int:
    version = read_version()
    system = platform.system().lower()
    target_name = platform_tag(system)

    binary_name = "icuewidget.exe" if system == "windows" else "icuewidget"
    artifact_dir = RELEASE_DIR / f"icuewidget-{version}-{target_name}"
    binary_path = artifact_dir / binary_name

    if not binary_path.exists():
        raise SystemExit(
            "Standalone binary not found. Build it first:\n  python build_standalone.py"
        )

    if system == "darwin":
        output_path = RELEASE_DIR / f"icuewidget-{version}-macos-installer.pkg"
        build_macos_installer(
            binary_path=binary_path, output_path=output_path, version=version
        )
        print(f"Built macOS installer package: {output_path}")
        return 0

    if system == "windows":
        output_path = RELEASE_DIR / f"icuewidget-{version}-windows-installer.exe"
        build_windows_installer(
            binary_path=binary_path, output_path=output_path, version=version
        )
        print(f"Built Windows installer executable: {output_path}")
        return 0

    raise SystemExit(
        f"Installer packaging is currently supported only on macOS and Windows (got: {system})."
    )


def build_macos_installer(
    *, binary_path: Path, output_path: Path, version: str
) -> None:
    if shutil.which("pkgbuild") is None:
        raise SystemExit(
            "pkgbuild is not available. Run this script on macOS with Xcode command line tools installed."
        )
    if shutil.which("productbuild") is None:
        raise SystemExit(
            "productbuild is not available. Run this script on macOS with Xcode command line tools installed."
        )

    staging_root = BUILD_DIR / "installer-macos-root"
    resources_dir = stage_macos_installer_resources()
    clean_paths(staging_root, MACOS_COMPONENT_PACKAGE, MACOS_DISTRIBUTION_XML, output_path)

    bin_dir = staging_root / "usr" / "local" / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)

    installed_binary = bin_dir / "icuewidget"
    shutil.copy2(binary_path, installed_binary)
    installed_binary.chmod(0o755)

    component_command = [
        "pkgbuild",
        "--root",
        str(staging_root),
        "--identifier",
        MACOS_PACKAGE_IDENTIFIER,
        "--version",
        version,
        "--install-location",
        "/",
        str(MACOS_COMPONENT_PACKAGE),
    ]
    subprocess.run(component_command, cwd=ROOT, check=True)

    write_macos_distribution_xml(version=version, component_package=MACOS_COMPONENT_PACKAGE)

    product_command = [
        "productbuild",
        "--distribution",
        str(MACOS_DISTRIBUTION_XML),
        "--resources",
        str(resources_dir),
        "--package-path",
        str(MACOS_COMPONENT_PACKAGE.parent),
        str(output_path),
    ]
    subprocess.run(product_command, cwd=ROOT, check=True)


def stage_macos_installer_resources() -> Path:
    if not MACOS_INSTALLER_RESOURCES_DIR.exists():
        raise SystemExit(
            f"macOS installer resources directory not found: {MACOS_INSTALLER_RESOURCES_DIR}"
        )
    if not CORSAIR_LOGO_SOURCE.exists():
        raise SystemExit(
            f"CORSAIR logo source not found: {CORSAIR_LOGO_SOURCE}"
        )

    clean_paths(MACOS_STAGED_RESOURCES_DIR)
    shutil.copytree(MACOS_INSTALLER_RESOURCES_DIR, MACOS_STAGED_RESOURCES_DIR)
    shutil.copy2(CORSAIR_LOGO_SOURCE, MACOS_STAGED_RESOURCES_DIR / "corsair-logo.png")

    return MACOS_STAGED_RESOURCES_DIR


def write_macos_distribution_xml(*, version: str, component_package: Path) -> None:
    component_package_name = escape(component_package.name)
    escaped_version = escape(version)
    escaped_package_id = escape(MACOS_PACKAGE_IDENTIFIER)

    MACOS_DISTRIBUTION_XML.parent.mkdir(parents=True, exist_ok=True)
    MACOS_DISTRIBUTION_XML.write_text(
        f'''<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
  <title>CORSAIR iCUE Widget CLI</title>
  <options customize="never" require-scripts="false"/>
  <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
  <background file="corsair-logo.png" mime-type="image/png" scaling="proportional" alignment="bottomleft"/>
  <welcome file="welcome.html" mime-type="text/html"/>
  <readme file="readme.html" mime-type="text/html"/>
  <choices-outline>
    <line choice="default"/>
  </choices-outline>
  <choice id="default" title="iCUE Widget CLI" description="Command-line tooling for CORSAIR iCUE widgets.">
    <pkg-ref id="{escaped_package_id}"/>
  </choice>
  <pkg-ref id="{escaped_package_id}" version="{escaped_version}" onConclusion="none">{component_package_name}</pkg-ref>
</installer-gui-script>
''',
        encoding="utf-8",
    )


def build_windows_installer(
    *, binary_path: Path, output_path: Path, version: str
) -> None:
    if not WINDOWS_INSTALLER_SCRIPT.exists():
        raise SystemExit(
            f"Windows installer script not found: {WINDOWS_INSTALLER_SCRIPT}"
        )

    makensis = shutil.which("makensis") or shutil.which("makensis.exe")
    if makensis is None:
        raise SystemExit(
            "makensis was not found in PATH. Install NSIS first, then retry.\n"
            "Example (PowerShell):\n"
            "  choco install nsis -y"
        )

    staged_assets_dir = stage_windows_installer_assets()

    clean_paths(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    command = [
        makensis,
        f"/DVERSION={version}",
        f"/DBINARY_PATH={binary_path.resolve()}",
        f"/DOUTFILE={output_path.resolve()}",
        f"/DBRAND_ASSET_DIR={staged_assets_dir.resolve()}",
        str(WINDOWS_INSTALLER_SCRIPT),
    ]
    subprocess.run(command, cwd=ROOT, check=True)


def stage_windows_installer_assets() -> Path:
    if not WINDOWS_INSTALLER_ASSETS_DIR.exists():
        raise SystemExit(
            f"Windows installer assets directory not found: {WINDOWS_INSTALLER_ASSETS_DIR}"
        )

    clean_paths(WINDOWS_STAGED_ASSETS_DIR)
    shutil.copytree(WINDOWS_INSTALLER_ASSETS_DIR, WINDOWS_STAGED_ASSETS_DIR)

    required_images = {
        "side bitmap": WINDOWS_SIDE_IMAGE,
        "header bitmap": WINDOWS_HEADER_IMAGE,
    }
    for label, filename in required_images.items():
        image_path = WINDOWS_STAGED_ASSETS_DIR / filename
        if image_path.exists():
            continue
        raise SystemExit(
            f"Missing pre-rendered NSIS {label}:\n"
            f"  {WINDOWS_INSTALLER_ASSETS_DIR / filename}\n"
            "Commit the BMP asset before building the installer."
        )

    return WINDOWS_STAGED_ASSETS_DIR


def read_version() -> str:
    return resolve_version()


def platform_tag(system: str) -> str:
    if system == "darwin":
        return "macos"
    if system == "windows":
        return "windows"
    return system


def clean_paths(*paths: Path) -> None:
    for path in paths:
        if path.exists():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()


if __name__ == "__main__":
    raise SystemExit(main())
