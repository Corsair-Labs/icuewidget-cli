from __future__ import annotations

import os
import re
from pathlib import Path


BASE_VERSION_RE = re.compile(r"^\s*app:\s*['\"]?([0-9]+\.[0-9]+)['\"]?\s*$")


def read_stamped_version() -> str | None:
    try:
        from ._build_version import VERSION
    except ImportError:
        return None
    return VERSION


def read_base_version() -> str:
    configured = os.environ.get("ICUEWIDGET_BASE_VERSION")
    if configured:
        return configured

    config_path = Path(__file__).resolve().parents[1] / ".jenkins-config.yaml"
    if config_path.exists():
        for line in config_path.read_text(encoding="utf-8").splitlines():
            match = BASE_VERSION_RE.match(line)
            if match:
                return match.group(1)

    return "0.0"


def resolve_version() -> str:
    stamped_version = read_stamped_version()
    if stamped_version:
        return stamped_version

    build_version = os.environ.get("BUILD_VERSION")
    if build_version:
        return build_version

    build_number = os.environ.get("BUILD_NUMBER")
    if build_number and build_number.isdigit():
        return f"{read_base_version()}.{build_number}"

    return f"{read_base_version()}.0"


__version__ = resolve_version()
