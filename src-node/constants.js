export const APP_NAME = "icuewidget";
export const NPM_PACKAGE_NAME = "@corsair/icuewidget-cli";
export const CLI_VERSION = "0.4.0";
export const DEFAULT_APP_VERSION = "5.45";
export const DEFAULT_FRAMEWORK_VERSION = "1.0.0";
export const DEFAULT_PLATFORM = "windows";
export const DEFAULT_DEVICE_TYPE = "dashboard_lcd";

export const ALLOWED_PLATFORMS = new Set(["windows"]);
export const ALLOWED_DEVICE_TYPES = new Set([
  "dashboard_lcd",
  "pump_lcd",
  "keyboard_lcd",
]);

export const SEMVER_RE = /^\d+\.\d+\.\d+$/;
export const APP_VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/;
export const IDENTIFIER_RE = /^[A-Za-z0-9.-]+$/;
export const SLUG_RE = /[^a-z0-9]+/g;
