from __future__ import annotations

import importlib.util
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DIST_DIR = ROOT / "dist"
BUILD_DIR = ROOT / "build"
RELEASE_DIR = ROOT / "release"
WINDOWS_ICON_PATH = ROOT / "installer" / "windows" / "assets" / "corsair-cli.ico"


def main() -> int:
    ensure_pyinstaller_installed()

    version = read_version()
    system = platform.system().lower()
    target_name = platform_tag(system)
    binary_name = "icuewidget.exe" if system == "windows" else "icuewidget"
    artifact_dir = RELEASE_DIR / f"icuewidget-{version}-{target_name}"

    clean_paths(DIST_DIR, BUILD_DIR, artifact_dir)

    stamp_version(version)

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name",
        "icuewidget",
        "--onefile",
        "--clean",
        "--noconfirm",
        "--hidden-import",
        "icuewidget_cli",
        str(ROOT / "icuewidget_cli_entry.py"),
    ]

    if system == "windows":
        if not WINDOWS_ICON_PATH.exists():
            raise SystemExit(
                "Missing CORSAIR icon for Windows executable build:\n"
                f"  {WINDOWS_ICON_PATH}\n"
                "Restore installer/windows/assets/corsair-cli.ico and retry."
            )
        command.extend(["--icon", str(WINDOWS_ICON_PATH)])

    subprocess.run(command, cwd=ROOT, check=True)

    artifact_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(DIST_DIR / binary_name, artifact_dir / binary_name)
    shutil.copy2(ROOT / "README.md", artifact_dir / "README.md")

    print(f"Built standalone binary: {artifact_dir / binary_name}")
    return 0


def ensure_pyinstaller_installed() -> None:
    if importlib.util.find_spec("PyInstaller") is not None:
        return

    install_command = f'"{sys.executable}" -m pip install .[build]'
    raise SystemExit(
        "PyInstaller is not installed for the current Python interpreter.\n"
        f"Install build dependencies first:\n  {install_command}\n\n"
        "PyInstaller builds for the current operating system only, so create macOS and Windows binaries on their respective runners."
    )


def stamp_version(version: str) -> None:
    version_file = ROOT / "icuewidget_cli" / "__init__.py"
    version_file.write_text(
        f'__all__ = ["__version__"]\n\n__version__ = "{version}"\n',
        encoding="utf-8",
    )


def read_version() -> str:
    env_version = os.environ.get("BUILD_VERSION")
    if env_version:
        return env_version
    return "0.2.4"


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
