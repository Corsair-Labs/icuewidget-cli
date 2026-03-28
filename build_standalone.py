from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DIST_DIR = ROOT / "dist"
BUILD_DIR = ROOT / "build"
RELEASE_DIR = ROOT / "release"


def main() -> int:
    version = read_version()
    system = platform.system().lower()
    target_name = platform_tag(system)
    binary_name = "icuewidget.exe" if system == "windows" else "icuewidget"
    artifact_dir = RELEASE_DIR / f"icuewidget-{version}-{target_name}"

    clean_paths(DIST_DIR, BUILD_DIR, artifact_dir)

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name",
        "icuewidget",
        "--onefile",
        "--clean",
        "--noconfirm",
        str(ROOT / "icuewidget_cli" / "__main__.py"),
    ]
    subprocess.run(command, cwd=ROOT, check=True)

    artifact_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(DIST_DIR / binary_name, artifact_dir / binary_name)
    shutil.copy2(ROOT / "README.md", artifact_dir / "README.md")

    archive_base = RELEASE_DIR / f"icuewidget-{version}-{target_name}"
    archive_format = "zip"
    archive_path = shutil.make_archive(
        str(archive_base),
        archive_format,
        root_dir=artifact_dir.parent,
        base_dir=artifact_dir.name,
    )

    print(f"Built standalone binary: {artifact_dir / binary_name}")
    print(f"Created release archive: {archive_path}")
    return 0


def read_version() -> str:
    namespace: dict[str, str] = {}
    version_file = ROOT / "icuewidget_cli" / "__init__.py"
    exec(version_file.read_text(encoding="utf-8"), namespace)
    return namespace["__version__"]


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
