from __future__ import annotations

import os
import platform
import shutil
import subprocess
from pathlib import Path

from icuewidget_cli.version import resolve_version


ROOT = Path(__file__).resolve().parent
RELEASE_DIR = ROOT / "release"
BUILD_DIR = ROOT / "build"
WINDOWS_INSTALLER_SCRIPT = ROOT / "installer" / "windows" / "icuewidget-installer.nsi"
WINDOWS_INSTALLER_ASSETS_DIR = ROOT / "installer" / "windows" / "assets"
WINDOWS_STAGED_ASSETS_DIR = BUILD_DIR / "installer-windows-assets"
WINDOWS_SIDE_IMAGE = "InstallerSideImage.bmp"
WINDOWS_HEADER_IMAGE = "CORSAIRLogo2020_horiz_K.bmp"


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

    staging_root = BUILD_DIR / "installer-macos-root"
    clean_paths(staging_root, output_path)

    bin_dir = staging_root / "usr" / "local" / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)

    installed_binary = bin_dir / "icuewidget"
    shutil.copy2(binary_path, installed_binary)
    installed_binary.chmod(0o755)

    command = [
        "pkgbuild",
        "--root",
        str(staging_root),
        "--identifier",
        "com.corsair.icuewidget-cli",
        "--version",
        version,
        "--install-location",
        "/",
        str(output_path),
    ]
    subprocess.run(command, cwd=ROOT, check=True)


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
