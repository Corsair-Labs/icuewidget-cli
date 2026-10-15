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
  "stream-deck-virtual-device",
]);

// Permission types accepted in manifest.permissions (see the iCUE widget docs, "Widget Permissions").
export const ALLOWED_PERMISSION_TYPES = new Set([
  "file",
  "folder",
  "url",
  "microphone",
  "camera",
  "speaker",
  "screen",
  "clipboard_read_write",
  "local_fonts_access",
  "self_signed_certificate",
  "download",
  "application",
]);

// Fields documented for each permission type; types not listed take no extra fields.
export const PERMISSION_TYPE_FIELDS = {
  file: ["path"],
  folder: ["path"],
  url: ["domain", "port"],
  self_signed_certificate: ["host"],
  application: ["application"],
};

// <Macro> prefixes accepted in file/folder permission paths.
export const PERMISSION_PATH_MACROS = new Set([
  "Home",
  "Desktop",
  "Documents",
  "Downloads",
  "Music",
  "Pictures",
  "Movies",
  "Temp",
  "AppData",
  "Runtime",
]);

// External applications the docs list for the "application" permission (compared case-insensitively).
export const KNOWN_PERMISSION_APPLICATIONS = new Set(["stream deck"]);

export const STREAM_DECK_PLUGIN_PREFIX = "widgetbuilder.streamdeck:";
export const FILE_SYSTEM_PLUGIN_PREFIX = "widgetbuilder.filesystemprovider:";

export const SEMVER_RE = /^\d+\.\d+\.\d+$/;
export const APP_VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/;
export const IDENTIFIER_RE = /^[A-Za-z0-9.-]+$/;
export const SLUG_RE = /[^a-z0-9]+/g;
