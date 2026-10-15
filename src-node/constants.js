import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const APP_NAME = "icuewidget";
export const NPM_PACKAGE_NAME = packageJson.name;
export const CLI_VERSION = packageJson.version;
export const DEFAULT_APP_VERSION = "5.45";
export const DEFAULT_FRAMEWORK_VERSION = "1.4.0";
export const DEFAULT_PLATFORM = "windows";
export const DEFAULT_DEVICE_TYPE = "dashboard_lcd";

export const ALLOWED_PLATFORMS = new Set(["windows"]);
export const ALLOWED_DEVICE_TYPES = new Set([
  "dashboard_lcd",
  "pump_lcd",
  "keyboard_lcd",
]);

// Control types accepted by iCUE for x-icue-property meta parameters (data-type).
// Anything else makes iCUE reject the widget with "Invalid meta parameter data type".
export const ALLOWED_PROPERTY_TYPES = new Set([
  "slider",
  "switch",
  "color",
  "combobox",
  "search-combobox",
  "tab-buttons",
  "textfield",
  "media-selector",
  "sensors-combobox",
  "sensors-factory",
]);

export const SEMVER_RE = /^\d+\.\d+\.\d+$/;
export const APP_VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/;
export const IDENTIFIER_RE = /^[A-Za-z0-9.-]+$/;
export const SLUG_RE = /[^a-z0-9]+/g;
