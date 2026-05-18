from __future__ import annotations

import re

APP_NAME = "icuewidget"
DEFAULT_APP_VERSION = "5.45"
DEFAULT_FRAMEWORK_VERSION = "1.0.0"
DEFAULT_PLATFORM = "windows"
DEFAULT_DEVICE_TYPE = "dashboard_lcd"
DEFAULT_TEXT_COLOR = "#FFFFFF"
DEFAULT_ACCENT_COLOR = "#7C3AED"
DEFAULT_BG_COLOR = "#111111"
DEFAULT_TRANSPARENCY = 100
ALLOWED_PLATFORMS = {DEFAULT_PLATFORM}
ALLOWED_DEVICE_TYPES = {"dashboard_lcd", "pump_lcd", "keyboard_lcd"}
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
APP_VERSION_RE = re.compile(r"^\d+\.\d+(?:\.\d+)?$")
IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9.-]+$")
SLUG_RE = re.compile(r"[^a-z0-9]+")
